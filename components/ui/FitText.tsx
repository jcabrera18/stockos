'use client'

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface FitTextProps {
  children:   React.ReactNode
  className?: string
  title?:     string
  /** Escala mínima de la fuente antes de dejar de achicar (0-1). Default 0.5 */
  minScale?:  number
}

// Muestra el contenido en una sola línea y reduce el font-size hasta que entre
// en el ancho disponible. Pensado para montos en KPIs: el número siempre se ve
// completo, sin abreviar ni cortar. El valor exacto queda en `title` (hover).
export function FitText({ children, className, title, minScale = 0.5 }: FitTextProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)

  const fit = useCallback(() => {
    const wrap = wrapRef.current
    const el = textRef.current
    if (!wrap || !el) return
    el.style.fontSize = ''
    const base = parseFloat(getComputedStyle(el).fontSize)
    const avail = wrap.clientWidth
    const natural = el.scrollWidth
    if (avail > 0 && natural > avail) {
      el.style.fontSize = `${Math.max(base * (avail / natural), base * minScale)}px`
    }
  }, [minScale])

  // Reajusta en cada render (cambia el valor) — barato, sin setState.
  useLayoutEffect(fit)

  // Reajusta cuando cambia el ancho disponible del contenedor.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => fit())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [fit])

  return (
    <div ref={wrapRef} className="w-full min-w-0 overflow-hidden">
      <span ref={textRef} title={title} className={cn('inline-block whitespace-nowrap', className)}>
        {children}
      </span>
    </div>
  )
}
