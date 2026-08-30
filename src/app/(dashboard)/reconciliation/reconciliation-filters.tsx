"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { DateRangePicker } from "@/components/date-range-picker";

interface Props {
  from: string;
  to: string;
}

export function ReconciliationFilters({ from, to }: Props): React.JSX.Element {
  const router = useRouter();

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  function handleChange(f: Date, t: Date): void {
    router.push(`/reconciliation?from=${format(f, "yyyy-MM-dd")}&to=${format(t, "yyyy-MM-dd")}`);
  }

  return (
    <DateRangePicker
      from={fromDate}
      to={toDate}
      onChange={handleChange}
      placeholder="Seleccionar rango de fechas"
    />
  );
}
