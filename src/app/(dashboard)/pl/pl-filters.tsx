"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { DateRangePicker } from "@/components/date-range-picker";
import { parseDateParam, serializePeriodRange, type DateRange } from "@/lib/date-range";

interface PlFiltersProps {
  entities: { companyId: string; companyName: string }[];
  /** Rango efectivo del P&L (YYYY-MM-DD), ya resuelto por el servidor. */
  from: string;
  to: string;
  currentEntity: string;
}

export function PlFilters({ entities, from, to, currentEntity }: PlFiltersProps): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  function push(overrides: Record<string, string>): void {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    router.push(`/pl?${params.toString()}`);
  }

  function handleRange(range: DateRange | null): void {
    if (!range) return;
    // `year` era el parámetro antiguo (selector de año): se limpia al elegir un rango.
    push({ ...serializePeriodRange(range), year: "" });
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Periodo</label>
        <DateRangePicker
          from={parseDateParam(from)}
          to={parseDateParam(to)}
          onChange={handleRange}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Entidad</label>
        <select
          value={currentEntity}
          onChange={(e) => push({ entity: e.target.value })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[12rem]"
        >
          <option value="consolidated">Consolidado</option>
          {entities.map((e) => (
            <option key={e.companyId} value={e.companyId}>{e.companyName}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
