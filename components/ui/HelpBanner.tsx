'use client'
import { useState, useEffect } from 'react'
import { X, HelpCircle } from 'lucide-react'

/**
 * Banner explicativo por página, descartable y persistente.
 * - Al cerrarlo (X) se guarda en localStorage y no vuelve a aparecer.
 * - Mientras está cerrado deja un botón "?" para volver a abrirlo si fue sin querer.
 *
 * Cada banner necesita un `id` único (se usa como key de localStorage).
 */
export function HelpBanner({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  const storageKey = `stockos_help_${id}`
  // null = aún no leímos localStorage (evita flash en SSR/hidratación)
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    setDismissed(localStorage.getItem(storageKey) === '1')
  }, [storageKey])

  if (dismissed === null) return null

  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => {
          localStorage.removeItem(storageKey)
          setDismissed(false)
        }}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--text3)] hover:text-[var(--accent)] transition-colors cursor-pointer"
      >
        <HelpCircle size={14} />
        <span>¿Cómo funciona esta sección?</span>
      </button>
    )
  }

  return (
    <div className="relative px-4 py-3 pr-10 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm text-[var(--text2)]">
      <p className="font-medium text-[var(--text)] mb-1">{title}</p>
      {children}
      <button
        type="button"
        aria-label="Cerrar ayuda"
        onClick={() => {
          localStorage.setItem(storageKey, '1')
          setDismissed(true)
        }}
        className="absolute top-2.5 right-2.5 p-1 rounded-[var(--radius-md)] text-[var(--text3)] hover:bg-[var(--surface2)] hover:text-[var(--text)] transition-colors cursor-pointer"
      >
        <X size={15} />
      </button>
    </div>
  )
}
