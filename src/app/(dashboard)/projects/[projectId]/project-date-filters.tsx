"use client";

import { useRouter } from "next/navigation";
import { DateRangePicker } from "@/components/date-range-picker";
import { parseDateParam, toDateParam, type DateRange } from "@/lib/date-range";

interface ProjectDateFiltersProps {
  from: string;
  to: string;
  projectId: string;
}

export function ProjectDateFilters({ from, to, projectId }: ProjectDateFiltersProps): React.JSX.Element {
  const router = useRouter();

  function handleChange(range: DateRange | null): void {
    if (!range) return;
    router.push(
      `/projects/${projectId}?from=${toDateParam(range.from)}&to=${toDateParam(range.to)}`
    );
  }

  return (
    <DateRangePicker
      from={parseDateParam(from)}
      to={parseDateParam(to)}
      onChange={handleChange}
    />
  );
}
