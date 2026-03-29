import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/skeleton";

export default function InvoicesLoading(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />

      {/* Filters skeleton */}
      <div className="flex flex-wrap gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-36" />
        ))}
      </div>

      <TableSkeleton rows={10} cols={8} />

      {/* Pagination skeleton */}
      <div className="flex justify-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-10" />
        ))}
      </div>
    </div>
  );
}
