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
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={cn(
        'w-full bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-2xl max-h-[90vh] flex flex-col',
        sizes[size]
      )}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] flex-shrink-0">
            <h2 className="text-base font-semibold text-[var(--text)]">{title}</h2>
            <button onClick={onClose} className="p-1 rounded text-[var(--text3)] hover:text-[var(--text)] hover:bg-[var(--surface2)] transition-colors">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="px-5 pt-5 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  )
}
