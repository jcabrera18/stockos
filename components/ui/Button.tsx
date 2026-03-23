'use client'
import { cn } from '@/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

  const variants = {
    primary:   'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]',
    secondary: 'bg-[var(--surface2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface3)]',
    ghost:     'text-[var(--text2)] hover:bg-[var(--surface2)] hover:text-[var(--text)]',
    danger:    'bg-[var(--danger)] text-white hover:opacity-90',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  }

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}
