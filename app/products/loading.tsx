import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <>
      <div className="px-5 py-4 flex items-center justify-between border-b border-[var(--border)]">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3.5 w-20 opacity-60" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
      <div className="p-5 space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
        </div>
        <TableSkeleton rows={12} />
      </div>
    </>
  )
}
