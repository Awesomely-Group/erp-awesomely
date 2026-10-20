import { Skeleton, TableSkeleton } from "@/components/skeleton";

export default function CampaignDetailLoading(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <Skeleton className="mb-3 h-4 w-40" />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-28" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={5} cols={8} />
      <TableSkeleton rows={5} cols={8} />
    </div>
  );
}
