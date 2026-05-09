export default function ProjectDashboardLoading(): React.JSX.Element {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Breadcrumb */}
      <div className="h-5 w-24 bg-gray-200 rounded" />

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="h-4 w-40 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-56 bg-gray-100 rounded-lg" />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 space-y-2">
            <div className="h-4 w-32 bg-gray-100 rounded" />
            <div className="h-8 w-24 bg-gray-200 rounded" />
          </div>
        ))}
      </div>

      {/* Rentabilidad */}
      <div className="space-y-3">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        <div className="bg-white rounded-xl border border-gray-200 h-40" />
      </div>

      {/* Timesheet */}
      <div className="space-y-3">
        <div className="h-5 w-24 bg-gray-200 rounded" />
        <div className="bg-white rounded-xl border border-gray-200 h-64" />
      </div>
    </div>
  );
}
