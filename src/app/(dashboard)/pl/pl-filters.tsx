"use client";

import { useRouter, useSearchParams } from "next/navigation";

interface PlFiltersProps {
  years: number[];
  entities: { companyId: string; companyName: string }[];
  currentYear: number;
  currentEntity: string;
}

export function PlFilters({ years, entities, currentYear, currentEntity }: PlFiltersProps): React.JSX.Element {
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

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Año</label>
        <select
          value={currentYear}
          onChange={(e) => push({ year: e.target.value })}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
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
