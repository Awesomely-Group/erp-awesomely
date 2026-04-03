import { Skeleton, TableSkeleton } from "@/components/skeleton";

export default function SyncLoading(): React.JSX.Element {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>

      {/* Filter chips */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-44" />
      </div>

      <TableSkeleton rows={8} cols={6} />
    </div>
  );
}
