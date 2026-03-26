import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-[var(--surface2)]', className)} />
  )
}

// Skeleton genérico para tablas — respeta el layout real (shape matching)
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="px-4 py-3 text-left w-[40%]"><Skeleton className="h-3 w-20" /></th>
            <th className="px-4 py-3 text-left hidden sm:table-cell"><Skeleton className="h-3 w-16" /></th>
            <th className="px-4 py-3 text-left hidden md:table-cell"><Skeleton className="h-3 w-14" /></th>
            <th className="px-4 py-3 text-left"><Skeleton className="h-3 w-12" /></th>
            <th className="px-4 py-3 text-left"><Skeleton className="h-3 w-10" /></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              <td className="px-4 py-3.5">
                <Skeleton className="h-4 w-36 mb-1.5" />
                <Skeleton className="h-3 w-20 opacity-50" />
              </td>
              <td className="px-4 py-3.5 hidden sm:table-cell">
                <Skeleton className="h-4 w-20" />
              </td>
              <td className="px-4 py-3.5 hidden md:table-cell">
                <Skeleton className="h-4 w-16" />
              </td>
              <td className="px-4 py-3.5">
                <Skeleton className="h-4 w-16" />
              </td>
              <td className="px-4 py-3.5">
                <Skeleton className="h-6 w-16 rounded-full" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Skeleton para cards del dashboard
export function StatCardSkeleton() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20 opacity-60" />
    </div>
  )
}

// Skeleton para card genérica con contenido de lista
export function CardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
      <div className="px-4 pt-4 pb-3 border-b border-[var(--border)]">
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20 opacity-50" />
            </div>
            <Skeleton className="h-3.5 w-16 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}
