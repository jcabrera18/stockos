import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {Icon && (
        <div className="w-12 h-12 rounded-xl bg-[var(--surface2)] flex items-center justify-center mb-4">
          <Icon size={22} className="text-[var(--text3)]" />
        </div>
      )}
      <p className="text-sm font-medium text-[var(--text)] mb-1">{title}</p>
      {description && (
        <p className="text-sm text-[var(--text3)] max-w-xs mb-4">{description}</p>
      )}
      {action}
    </div>
  )
}
