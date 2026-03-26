import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <>
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-3.5 w-24 mt-1.5 opacity-60" />
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
          <Skeleton className="h-8 w-36 rounded-full ml-auto" />
        </div>
        <TableSkeleton rows={15} />
      </div>
    </>
  )
}
