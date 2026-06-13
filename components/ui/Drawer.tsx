'use client'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Clase Tailwind de ancho del panel (desktop). El panel es full-width en mobile. */
  width?: string
  zIndex?: number
}

/**
 * Panel lateral que se desliza desde la derecha. A diferencia del Modal centrado,
 * deja el contenido de fondo visible (backdrop tenue) y usa toda la altura de la
 * pantalla, así el contenido respira y no queda apretado.
 */
export function Drawer({ open, onClose, title, children, footer, width = 'sm:max-w-[520px]', zIndex }: DrawerProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop tenue: el carrito sigue visible (atenuado) detrás */}
      <div
        className="fixed inset-0"
        style={{ background: 'rgba(0,0,0,0.4)', zIndex: zIndex ?? 50 }}
        onClick={onClose}
      />
      {/* Panel deslizante anclado a la derecha, altura completa */}
      <div
        className={cn(
          'drawer-slide-in fixed inset-y-0 right-0 w-full bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col',
          width,
        )}
        style={{ zIndex: (zIndex ?? 50) + 1 }}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
            <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 -mr-1 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] active:bg-[var(--surface2)] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="px-4 sm:px-5 pt-5 pb-5 overflow-y-auto flex-1">
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0 border-t border-[var(--border)] px-4 sm:px-5 pt-3 pb-4 bg-[var(--surface)]">
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
