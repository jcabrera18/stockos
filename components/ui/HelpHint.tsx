'use client'
import { useEffect, useRef, useState } from 'react'
import { HelpCircle, X } from 'lucide-react'

/**
 * Signo de pregunta discreto que abre un popover con la ayuda de la sección.
 * Reemplaza al HelpBanner grande: no ocupa espacio ni sobrecarga el módulo.
 *
 * Se ubica junto al título en el PageHeader.
 */
export function HelpHint({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-label="Ayuda de esta sección"
        onClick={() => setOpen(v => !v)}
        className="p-0.5 rounded-full text-[var(--text3)] hover:text-[var(--accent)] transition-colors cursor-pointer"
      >
        <HelpCircle size={16} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 w-[min(20rem,80vw)] px-4 py-3 pr-9 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-lg text-sm text-[var(--text2)] leading-relaxed"
          role="dialog"
        >
          <p className="font-medium text-[var(--text)] mb-1">{title}</p>
          {children}
          <button
            type="button"
            aria-label="Cerrar ayuda"
            onClick={() => setOpen(false)}
            className="absolute top-2 right-2 p-1 rounded-[var(--radius-md)] text-[var(--text3)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
