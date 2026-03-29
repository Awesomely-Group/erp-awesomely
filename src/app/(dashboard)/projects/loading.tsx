import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/skeleton";

export default function ProjectsLoading(): React.JSX.Element {
  return (
    <div className="space-y-8">
      <PageHeaderSkeleton />

      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-48" />
          </div>
          <TableSkeleton rows={6} cols={6} />
        </div>
      ))}
    </div>
  );
}
