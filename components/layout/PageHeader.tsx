import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title:       string
  description?: string
  action?:     React.ReactNode
  className?:  string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--border)]', className)}>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-[var(--text)]">{title}</h1>
        {description && (
          <p className="text-sm text-[var(--text3)] mt-0.5 truncate">{description}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap gap-2 items-center">{action}</div>}
    </div>
  )
}
