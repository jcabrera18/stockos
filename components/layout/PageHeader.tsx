import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title:       string
  description?: string
  action?:     React.ReactNode
  className?:  string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 py-5 border-b border-[var(--border)]', className)}>
      <div>
        <h1 className="text-lg font-semibold text-[var(--text)]">{title}</h1>
        {description && (
          <p className="text-sm text-[var(--text3)] mt-0.5">{description}</p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
}
