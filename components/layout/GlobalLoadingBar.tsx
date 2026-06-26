'use client'
import { useEffect, useState } from 'react'
import { subscribeLoading } from '@/lib/api'

// Barra de progreso global, fija arriba de todo. Se enciende cuando hay al
// menos un request en vuelo y persiste hasta que terminan todos. Damos 120ms
// de gracia antes de mostrarla para que los requests rápidos (la mayoría) no la
// hagan parpadear; los lentos —los que dejaban la app "colgada"— sí la disparan.
export function GlobalLoadingBar() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null
    const unsub = subscribeLoading((count) => {
      if (count > 0) {
        if (!showTimer) {
          showTimer = setTimeout(() => { setActive(true); showTimer = null }, 120)
        }
      } else {
        if (showTimer) { clearTimeout(showTimer); showTimer = null }
        setActive(false)
      }
    })
    return () => { if (showTimer) clearTimeout(showTimer); unsub() }
  }, [])

  return (
    <div
      aria-hidden
      className={`fixed top-0 left-0 right-0 z-[100] h-0.5 overflow-hidden pointer-events-none transition-opacity duration-200 ${active ? 'opacity-100 indeterminate-bar' : 'opacity-0'}`}
    />
  )
}
