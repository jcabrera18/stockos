'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCatalogMemory, syncCatalog, getLastCatalogSync } from '@/lib/catalog-cache'

const SYNC_INTERVAL_MS = 2 * 60 * 1000  // 2 minutos (refresh incremental en background)

/**
 * Maneja el ciclo de vida del cache local del catálogo (/products).
 *
 * - Al montar: pinta lo cacheado al instante + full sync (trae fresco y poda bajas).
 * - Cada 2 min y al recuperar foco: refresh incremental en background.
 * - El throttle de duplicados vive en `syncCatalog` (no re-sincroniza si ya lo hizo
 *   hace <30s), así navegar a /products repetidas veces no dispara syncs redundantes.
 * - `ready` indica que el cache tiene datos para consultar localmente.
 * - `lastSyncedAt` cambia en cada sync → la página re-consulta para reflejar fresh data.
 *
 * Si el sync falla (sin conexión) la página sigue usando el fallback al server.
 */
export function useCatalogSync() {
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const initialized = useRef(false)

  const refreshTimestamp = useCallback(() => {
    getLastCatalogSync().then(setLastSyncedAt).catch(() => {})
  }, [])

  const runSync = useCallback(async (opts?: { full?: boolean; force?: boolean }) => {
    setSyncing(true)
    try {
      await syncCatalog(opts)
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

    // 1) Pintar lo cacheado al instante (visitas repetidas → grilla lista sin esperar red).
    loadCatalogMemory()
      .then(hasData => { if (hasData) { setReady(true); refreshTimestamp() } })
      .catch(() => {})

    // 2) Full sync al entrar: trae todo fresco y poda bajas de otros dispositivos.
    runSync({ full: true })
  }, [refreshTimestamp, runSync])

  useEffect(() => {
    if (!ready) return

    const interval = setInterval(() => runSync(), SYNC_INTERVAL_MS)
    const onFocus = () => runSync() // el throttle de 30s vive en syncCatalog
    window.addEventListener('focus', onFocus)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [ready, runSync])

  // force: saltea el throttle (ej. tras crear/editar un producto, para reflejarlo ya).
  const forceSync = useCallback(() => runSync({ force: true }), [runSync])

  return { ready, syncing, lastSyncedAt, forceSync }
}
