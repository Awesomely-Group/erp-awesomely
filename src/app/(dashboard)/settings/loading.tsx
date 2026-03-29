import { PageHeaderSkeleton, Skeleton } from "@/components/skeleton";

export default function SettingsLoading(): React.JSX.Element {
  return (
    <div className="space-y-10 max-w-3xl">
      <PageHeaderSkeleton />

      {Array.from({ length: 2 }).map((_, section) => (
        <div key={section} className="space-y-4">
          <Skeleton className="h-5 w-44" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
