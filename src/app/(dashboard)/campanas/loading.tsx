import { Skeleton, TableSkeleton } from "@/components/skeleton";

export default function CampanasLoading(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <Skeleton className="mb-3 h-3 w-16" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-56" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <Skeleton className="mb-4 h-4 w-24" />
        <Skeleton className="h-64 w-full" />
      </div>
      <TableSkeleton rows={3} cols={8} />
    </div>
  );
}
