'use client'
import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'

/**
 * Auto-actualización del service worker.
 *
 * El SW (`app/sw.ts`) usa skipWaiting + clientsClaim, así que una versión nueva se
 * activa sola y toma control de la pestaña → dispara `controllerchange`. Cuando eso
 * pasa, el código que está corriendo sigue siendo el VIEJO (el bundle ya cargado);
 * hay que recargar para tomar el nuevo. Sin esto, un cliente con la pestaña siempre
 * abierta podía quedarse en una versión vieja indefinidamente (ej. el bug del
 * catálogo vacío que no se curaba hasta recargar a mano).
 *
 * Cuidado: NO interrumpir una venta en curso. En `/pos` diferimos la recarga hasta
 * que el usuario navega fuera (consistente con `reloadOnOnline: false` en la config).
 */
export function ServiceWorkerUpdater() {
  const pathname = usePathname()
  const updatePending = useRef(false)
  const reloaded = useRef(false)

  const maybeReload = useCallback(() => {
    if (!updatePending.current || reloaded.current) return
    // Venta en curso → esperar a salir del POS para no perder el carrito.
    if (window.location.pathname.startsWith('/pos')) return
    reloaded.current = true
    // Avisamos antes de recargar para que el usuario entienda el refresco.
    toast.loading('Actualizando a la última versión…')
    setTimeout(() => window.location.reload(), 1200)
  }, [])

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    // Solo auto-recargar en UPDATES (ya había un SW controlando). En la primera
    // instalación no hace falta: la página recién cargada ya corre el código nuevo.
    if (!navigator.serviceWorker.controller) return

    const onChange = () => { updatePending.current = true; maybeReload() }
    navigator.serviceWorker.addEventListener('controllerchange', onChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onChange)
  }, [maybeReload])

  // Reintenta al cambiar de ruta (ej. cuando el usuario sale del POS).
  useEffect(() => { maybeReload() }, [pathname, maybeReload])

  return null
}
