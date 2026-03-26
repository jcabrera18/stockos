import { Skeleton, StatCardSkeleton, CardListSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <>
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-3.5 w-32 mt-1.5 opacity-60" />
      </div>
      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-32 opacity-50" />
          </div>
          <CardListSkeleton rows={4} />
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-48 opacity-40" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => <CardListSkeleton key={i} rows={5} />)}
        </div>
      </div>
    </>
  )
}
