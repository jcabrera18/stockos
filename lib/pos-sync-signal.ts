'use client'
/**
 * Señal cross-tab para invalidar el cache del POS.
 *
 * El POS mantiene el catálogo y los precios en IndexedDB y sincroniza en
 * background (cada 10 min o al recuperar foco). Cuando el usuario edita un
 * producto, una lista de precios o una promoción en OTRA pestaña (/products,
 * /price-lists, /promotions, etc.), esa pestaña emite esta señal para que la
 * pestaña del POS re-sincronice al instante en vez de mostrar el precio viejo
 * hasta el próximo ciclo.
 *
 * Implementación: BroadcastChannel (cross-tab, mismo origen) con fallback a
 * localStorage `storage` events para navegadores sin BroadcastChannel. Ambos
 * disparan sólo en OTRAS pestañas, que es exactamente lo que necesitamos.
 */
const CHANNEL = 'stockos_pos_sync'
const LS_KEY = 'stockos_pos_sync_ping'

let channel: BroadcastChannel | null = null
function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  if (!channel) channel = new BroadcastChannel(CHANNEL)
  return channel
}

/** Avisa a la pestaña del POS que el catálogo/precios cambiaron → debe re-sincronizar. */
export function notifyPOSDataChanged(): void {
  try {
    getChannel()?.postMessage(Date.now())
    // Fallback para navegadores sin BroadcastChannel. El `storage` event sólo
    // dispara en las demás pestañas del mismo origen.
    localStorage.setItem(LS_KEY, String(Date.now()))
  } catch {
    // non-blocking
  }
}

/** Suscribe a cambios de catálogo/precios desde otras pestañas. Retorna cleanup. */
export function onPOSDataChanged(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const ch = getChannel()
  const onMsg = () => cb()
  ch?.addEventListener('message', onMsg)
  const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY) cb() }
  window.addEventListener('storage', onStorage)
  return () => {
    ch?.removeEventListener('message', onMsg)
    window.removeEventListener('storage', onStorage)
  }
}
