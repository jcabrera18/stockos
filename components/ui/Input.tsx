'use client'
import { cn } from '@/lib/utils'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--text2)]"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-md',
          'bg-[var(--surface)] border border-[var(--border)]',
          'text-[var(--text)] placeholder:text-[var(--text3)]',
          'focus:outline-none focus:border-[var(--accent)]',
          'transition-colors',
          error && 'border-[var(--danger)]',
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
      {hint && !error && <span className="text-xs text-[var(--text3)]">{hint}</span>}
    </div>
  )
}
