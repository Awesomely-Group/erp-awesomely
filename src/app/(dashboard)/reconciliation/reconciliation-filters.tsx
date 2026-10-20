"use client";

import { useRouter } from "next/navigation";
import { DateRangePicker } from "@/components/date-range-picker";
import { parseDateParam, toDateParam, type DateRange } from "@/lib/date-range";

interface Props {
  from: string;
  to: string;
}

export function ReconciliationFilters({ from, to }: Props): React.JSX.Element {
  const router = useRouter();

  function handleChange(range: DateRange | null): void {
    if (!range) return;
    router.push(`/reconciliation?from=${toDateParam(range.from)}&to=${toDateParam(range.to)}`);
  }

  return (
    <DateRangePicker
      from={parseDateParam(from)}
      to={parseDateParam(to)}
      onChange={handleChange}
    />
  );
}
