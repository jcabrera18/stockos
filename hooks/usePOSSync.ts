'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { initPOSCache, syncPOSCache } from '@/lib/pos-cache'

const SYNC_INTERVAL_MS = 10 * 60 * 1000 // 10 minutos

/**
 * Maneja el ciclo de vida del cache local del POS.
 *
 * - Al montar: descarga catálogo completo (initPOSCache)
 * - Cada 10 min: refresh en background (syncPOSCache)
 * - Al recuperar foco del tab: refresh en background
 *
 * Si init falla (sin conexión) el POS sigue funcionando vía server fallback.
 * `cacheReady` indica si el cache tiene datos para ser usado.
 */
export function usePOSSync(warehouseId?: string | null) {
  const [cacheReady, setCacheReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const initialized = useRef(false)
  const warehouseIdRef = useRef(warehouseId)
  useEffect(() => { warehouseIdRef.current = warehouseId }, [warehouseId])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    setSyncing(true)
    initPOSCache(warehouseId)
      .then(() => setCacheReady(true))
      .catch(() => { setCacheReady(false) })
      .finally(() => setSyncing(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync cuando cambia el warehouse (ej: workstation carga después del init)
  const prevWarehouseRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (prevWarehouseRef.current === undefined) { prevWarehouseRef.current = warehouseId; return }
    if (prevWarehouseRef.current === warehouseId) return
    prevWarehouseRef.current = warehouseId
    if (!warehouseId) return
    syncPOSCache(warehouseId).catch(() => {})
  }, [warehouseId])

  // Sync periódico y en recuperación de foco
  useEffect(() => {
    if (!cacheReady) return

    const interval = setInterval(() => {
      syncPOSCache(warehouseIdRef.current).catch(() => {})
    }, SYNC_INTERVAL_MS)

    const onFocus = () => syncPOSCache(warehouseIdRef.current).catch(() => {})
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [cacheReady])

  const forceSync = useCallback(async (): Promise<void> => {
    setSyncing(true)
    try {
      await syncPOSCache(warehouseIdRef.current)
      setCacheReady(true)
    } finally {
      setSyncing(false)
    }
  }, [])

  return { cacheReady, syncing, forceSync }
}
