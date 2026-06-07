'use client'
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

// Indicador global de modo offline. Aparece en cualquier pantalla (incluido el
// POS, que tiene su propio layout) cuando se pierde la conexión, para avisar que
// los datos pueden estar desactualizados. Ver .claude/OFFLINE_PLAN.md.
export function OfflineBanner() {
  // Arranca online para no parpadear en SSR / primera pintura.
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      className="fixed top-2 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--warning-subtle)] border border-[var(--warning)] shadow-lg max-w-[calc(100vw-1rem)]"
    >
      <WifiOff size={14} className="text-[var(--warning)] flex-shrink-0" />
      <span className="text-xs font-medium text-[var(--warning)] truncate">
        Sin conexión · los datos pueden no estar actualizados
      </span>
    </div>
  )
}
