'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { initPOSCache, syncPOSCache } from '@/lib/pos-cache'

const SYNC_INTERVAL_MS = 10 * 60 * 1000 // 10 minutos
const FOCUS_THROTTLE_MS = 2 * 60 * 1000 // mínimo entre syncs disparados por foco

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
export function usePOSSync(warehouseId?: string | null, enabled: boolean = true) {
  const [cacheReady, setCacheReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const initialized = useRef(false)
  const warehouseIdRef = useRef(warehouseId)
  useEffect(() => { warehouseIdRef.current = warehouseId }, [warehouseId])

  // Timestamp del último sync para throttlear los disparados por foco. Sin esto,
  // cada vez que la ventana recupera el foco (alt-tab, devtools, etc.) se
  // re-descargaba el catálogo completo, generando ráfagas continuas de requests.
  const lastSyncAtRef = useRef(0)
  const runSync = useCallback(() => {
    lastSyncAtRef.current = Date.now()
    return syncPOSCache(warehouseIdRef.current).catch(() => {})
  }, [])

  useEffect(() => {
    // `enabled=false` difiere la descarga del catálogo hasta que se necesite
    // (ej. en /orders, recién al abrir el form de nuevo pedido). El POS lo deja
    // en true para sincronizar al entrar.
    if (!enabled) return
    if (initialized.current) return
    initialized.current = true

    setSyncing(true)
    initPOSCache(warehouseIdRef.current)
      .then(() => { lastSyncAtRef.current = Date.now(); setCacheReady(true) })
      .catch(() => { setCacheReady(false) })
      .finally(() => setSyncing(false))
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sync cuando cambia el warehouse (ej: workstation carga después del init)
  const prevWarehouseRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (prevWarehouseRef.current === undefined) { prevWarehouseRef.current = warehouseId; return }
    if (prevWarehouseRef.current === warehouseId) return
    prevWarehouseRef.current = warehouseId
    if (!warehouseId) return
    if (!initialized.current) return // no sincronizar antes del init lazy
    runSync()
  }, [warehouseId, runSync])

  // Sync periódico y en recuperación de foco
  useEffect(() => {
    if (!cacheReady) return

    const interval = setInterval(runSync, SYNC_INTERVAL_MS)

    const onFocus = () => {
      if (Date.now() - lastSyncAtRef.current < FOCUS_THROTTLE_MS) return
      runSync()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [cacheReady, runSync])

  const forceSync = useCallback(async (): Promise<void> => {
    setSyncing(true)
    try {
      lastSyncAtRef.current = Date.now()
      await syncPOSCache(warehouseIdRef.current)
      setCacheReady(true)
    } finally {
      setSyncing(false)
    }
  }, [])

  return { cacheReady, syncing, forceSync }
}
