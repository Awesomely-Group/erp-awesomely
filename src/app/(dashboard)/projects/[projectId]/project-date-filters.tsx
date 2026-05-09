"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { DateRangePicker } from "@/components/date-range-picker";

interface ProjectDateFiltersProps {
  from: string;
  to: string;
  projectId: string;
}

export function ProjectDateFilters({ from, to, projectId }: ProjectDateFiltersProps): React.JSX.Element {
  const router = useRouter();

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  function handleChange(f: Date, t: Date): void {
    router.push(
      `/projects/${projectId}?from=${format(f, "yyyy-MM-dd")}&to=${format(t, "yyyy-MM-dd")}`
    );
  }

  const presets = [
    { label: "Este trimestre", href: `/projects/${projectId}?period=quarter` },
    { label: "Este año", href: `/projects/${projectId}?period=year` },
  ];

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {presets.map((p) => (
        <a
          key={p.href}
          href={p.href}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {p.label}
        </a>
      ))}

      <DateRangePicker
        from={fromDate}
        to={toDate}
        onChange={handleChange}
        placeholder="Seleccionar rango de fechas"
      />
    </div>
  );
}
