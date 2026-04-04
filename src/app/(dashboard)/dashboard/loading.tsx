import { Skeleton } from "@/components/skeleton";

export default function DashboardLoading(): React.JSX.Element {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <Skeleton className="h-3 w-36 mb-3" />
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-10 w-44" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-40" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <Skeleton className="h-4 w-36" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex justify-between py-2 border-b border-gray-100">
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
