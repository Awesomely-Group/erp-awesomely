"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MARCA_FILTER_UNASSIGNED, MARCA_OPTIONS } from "@/lib/org";
import { DateRangePicker } from "@/components/date-range-picker";
import { resolvePeriodRange, serializePeriodRange } from "@/lib/date-range";

export function DashboardFilters(): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  // El periodo vive solo en la URL: el selector lo lee de ahí y lo escribe vía applyWith.
  const period = sp.get("period") ?? "";
  const dateFrom = sp.get("dateFrom") ?? "";
  const dateTo = sp.get("dateTo") ?? "";
  const range = resolvePeriodRange(period, dateFrom, dateTo);
  const [marca, setMarca] = useState(sp.get("marca") ?? "");

  function applyWith(overrides: Partial<{
    period: string; dateFrom: string; dateTo: string; marca: string;
  }>): void {
    const m = { period, dateFrom, dateTo, marca, ...overrides };
    const params = new URLSearchParams();
    if (m.period) {
      params.set("period", m.period);
      if (m.period === "custom") {
        if (m.dateFrom) params.set("dateFrom", m.dateFrom);
        if (m.dateTo) params.set("dateTo", m.dateTo);
      }
    }
    if (m.marca) params.set("marca", m.marca);
    const q = params.toString();
    router.push(q ? `/dashboard?${q}` : "/dashboard");
  }

  function reset(): void {
    setMarca("");
    router.push("/dashboard");
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Periodo</label>
          <DateRangePicker
            from={range?.from ?? null}
            to={range?.to ?? null}
            allowClear
            onChange={(r) => applyWith(serializePeriodRange(r))}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Marca</label>
          <select
            value={marca}
            onChange={(e) => { const v = e.target.value; setMarca(v); applyWith({ marca: v }); }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[12rem]"
          >
            <option value="">Todas</option>
            <option value={MARCA_FILTER_UNASSIGNED}>Sin asignar</option>
            {MARCA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Limpiar
        </button>
    </div>
  );
}
