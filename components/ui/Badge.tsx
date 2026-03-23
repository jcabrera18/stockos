import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--surface3)] text-[var(--text2)]',
    success: 'bg-[var(--accent-subtle)] text-[var(--accent)]',
    warning: 'bg-[var(--warning-subtle)] text-[var(--warning)]',
    danger:  'bg-[var(--danger-subtle)] text-[var(--danger)]',
    info:    'bg-[var(--surface3)] text-[var(--text)]',
  }

  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
      variants[variant],
      className
    )}>
      {children}
    </span>
  )
}
