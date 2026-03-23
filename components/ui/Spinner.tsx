import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn(
      'w-5 h-5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin',
      className
    )} />
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Spinner className="w-7 h-7" />
    </div>
  )
}
