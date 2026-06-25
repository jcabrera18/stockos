import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface StatCardProps {
  title:      string
  value:      string | number
  valueTitle?: string   // valor exacto para el tooltip nativo (hover)
  valueClassName?: string  // override del tamaño/tracking del valor (ej. números largos)
  subtitle?:  string
  icon?:      LucideIcon
  trend?:     { value: number; label: string }
  delta?:     { value: number; label: string }  // comparativo con flecha
  accent?:    boolean
  danger?:    boolean
  className?: string
}

export function StatCard({ title, value, valueTitle, valueClassName, subtitle, icon: Icon, trend, delta, accent, danger, className }: StatCardProps) {
  return (
    <div className={cn(
      'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4',
      accent && 'border-[var(--accent)] bg-[var(--accent-subtle)]',
      danger && 'border-[var(--danger)] bg-[var(--danger-subtle)]',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--text3)] mb-1 truncate">{title}</p>
          <p
            title={valueTitle}
            className={cn(
              'font-semibold mono tabular-nums truncate',
              valueClassName ?? 'text-2xl',
              danger ? 'text-[var(--danger)]' : accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'
            )}
          >
            {value}
          </p>
          {delta && (
            <div className={cn(
              'flex items-center gap-1 mt-1.5 text-xs font-medium',
              delta.value >= 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'
            )}>
              {delta.value >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              <span className="mono">{delta.value >= 0 ? '+' : ''}{delta.value}%</span>
              <span className="text-[var(--text3)] font-normal">{delta.label}</span>
            </div>
          )}
          {subtitle && (
            <p className="text-xs text-[var(--text3)] mt-1 truncate">{subtitle}</p>
          )}
          {trend && (
            <p className={cn(
              'text-xs mt-1 font-medium',
              trend.value >= 0 ? 'text-[var(--accent)]' : 'text-[var(--danger)]'
            )}>
              {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface2)] flex items-center justify-center flex-shrink-0">
            <Icon size={17} className="text-[var(--text3)]" />
          </div>
        )}
      </div>
    </div>
  )
}
