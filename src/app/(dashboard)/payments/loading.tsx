import { PageHeaderSkeleton, Skeleton, TableSkeleton } from "@/components/skeleton";

export default function PaymentsLoading(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-5 w-48" />
          <TableSkeleton rows={3} cols={5} />
        </div>
      ))}
    </div>
  );
}
