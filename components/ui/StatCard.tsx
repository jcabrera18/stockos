import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  title:     string
  value:     string | number
  subtitle?: string
  icon?:     LucideIcon
  trend?:    { value: number; label: string }
  accent?:   boolean
  className?: string
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, accent, className }: StatCardProps) {
  return (
    <div className={cn(
      'bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4',
      accent && 'border-[var(--accent)] bg-[var(--accent-subtle)]',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--text3)] mb-1 truncate">{title}</p>
          <p className={cn(
            'text-2xl font-semibold mono tabular-nums truncate',
            accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'
          )}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-[var(--text3)] mt-1">{subtitle}</p>
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
