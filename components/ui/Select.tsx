'use client'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export function Select({ label, error, options, placeholder, className, id, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-[var(--text2)]">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            'w-full px-3 py-2 pr-9 text-sm rounded-md appearance-none',
            'bg-[var(--surface)] border border-[var(--border)]',
            'text-[var(--text)]',
            'focus:outline-none focus:border-[var(--accent)]',
            'transition-colors cursor-pointer',
            error && 'border-[var(--danger)]',
            className
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown
          size={15}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text3)]"
        />
      </div>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </div>
  )
}
