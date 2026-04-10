'use client'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  zIndex?: number
}

export function Modal({ open, onClose, title, children, size = 'md', zIndex }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') e.preventDefault() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: zIndex ?? 50 }}
      onClick={e => e.stopPropagation()}
    >
      <div className={cn(
        'w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl max-h-[90vh] flex flex-col',
        sizes[size]
      )}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
            <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
            <button onClick={onClose} className="p-2 rounded-[var(--radius-md)] text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] active:bg-[var(--surface2)] transition-colors -mr-1">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="px-4 sm:px-5 pt-5 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
