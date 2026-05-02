"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { DateRangePicker } from "@/components/date-range-picker";

interface ProfitabilityFiltersProps {
  from: string;
  to: string;
}

const PRESET_LINKS: Array<{ label: string; href: string }> = [
  { label: "Este trimestre", href: "/profitability?period=quarter" },
  { label: "Este año", href: "/profitability?period=year" },
];

export function ProfitabilityFilters({ from, to }: ProfitabilityFiltersProps): React.JSX.Element {
  const router = useRouter();

  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;

  function handleChange(f: Date, t: Date): void {
    router.push(
      `/profitability?from=${format(f, "yyyy-MM-dd")}&to=${format(t, "yyyy-MM-dd")}`
    );
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRESET_LINKS.map((p) => (
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
