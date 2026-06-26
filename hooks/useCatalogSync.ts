'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { initCatalogCache, syncCatalog, getLastCatalogSync } from '@/lib/catalog-cache'

const SYNC_INTERVAL_MS = 5 * 60 * 1000  // 5 minutos
const FOCUS_THROTTLE_MS = 2 * 60 * 1000 // mínimo entre syncs disparados por foco

/**
 * Maneja el ciclo de vida del cache local del catálogo (/products).
 *
 * - Al montar: construye memoria + sync (initCatalogCache)
 * - Cada 5 min y al recuperar foco: refresh incremental en background
 * - `ready` indica que el cache tiene datos para consultar localmente
 * - `lastSyncedAt` cambia en cada sync → la página re-consulta para reflejar fresh data
 *
 * Si el sync falla (sin conexión) la página sigue usando el fallback al server.
 */
export function useCatalogSync() {
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const initialized = useRef(false)

  const lastSyncAtRef = useRef(0)

  const refreshTimestamp = useCallback(() => {
    getLastCatalogSync().then(setLastSyncedAt).catch(() => {})
  }, [])

  const runSync = useCallback(async () => {
    lastSyncAtRef.current = Date.now()
    setSyncing(true)
    try {
      await syncCatalog()
      setReady(true)
      refreshTimestamp()
    } catch {
      // sin conexión → la página cae al fallback del server
    } finally {
      setSyncing(false)
    }
  }, [refreshTimestamp])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    setSyncing(true)
    initCatalogCache()
      .then(() => { lastSyncAtRef.current = Date.now(); setReady(true); refreshTimestamp() })
      .catch(() => setReady(false))
      .finally(() => setSyncing(false))
  }, [refreshTimestamp])

  useEffect(() => {
    if (!ready) return

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
  }, [ready, runSync])

  const forceSync = useCallback(() => runSync(), [runSync])

  return { ready, syncing, lastSyncedAt, forceSync }
}
