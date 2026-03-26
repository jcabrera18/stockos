import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <>
      <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--border)]">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-3.5 w-32 opacity-60" />
        </div>
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
        <TableSkeleton rows={10} />
      </div>
    </>
  )
}
