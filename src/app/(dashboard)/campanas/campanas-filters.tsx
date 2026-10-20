"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { CAMPANAS_DEFAULT_PERIOD, CAMPANAS_PERIODS } from "./campanas-periods";

interface Option {
  value: string;
  label: string;
}

/**
 * Filtros de /campanas: mismo patrón que dashboard-filters.tsx (estado en la URL,
 * `router.push`). No hay "Todas las fechas": las métricas de Ads se leen siempre sobre
 * un rango, y el valor por defecto es el mes en curso, que es lo que se compara con las
 * metas mensuales.
 */
export function CampanasFilters({
  marcas,
  lines,
  campaigns,
}: {
  marcas: Option[];
  lines: string[];
  campaigns: Option[];
}): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [period, setPeriod] = useState(sp.get("period") ?? CAMPANAS_DEFAULT_PERIOD);
  const [dateFrom, setDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("dateTo") ?? "");
  const [marca, setMarca] = useState(sp.get("marca") ?? "");
  const [lineOfBusiness, setLineOfBusiness] = useState(sp.get("lineOfBusiness") ?? "");
  const [campaignId, setCampaignId] = useState(sp.get("campaignId") ?? "");

  type State = { period: string; dateFrom: string; dateTo: string; marca: string; lineOfBusiness: string; campaignId: string };

  function applyWith(overrides: Partial<State>): void {
    const m: State = { period, dateFrom, dateTo, marca, lineOfBusiness, campaignId, ...overrides };
    const params = new URLSearchParams();
    if (m.period && m.period !== CAMPANAS_DEFAULT_PERIOD) params.set("period", m.period);
    if (m.period === "custom") {
      if (m.dateFrom) params.set("dateFrom", m.dateFrom);
      if (m.dateTo) params.set("dateTo", m.dateTo);
    }
    if (m.marca) params.set("marca", m.marca);
    if (m.lineOfBusiness) params.set("lineOfBusiness", m.lineOfBusiness);
    if (m.campaignId) params.set("campaignId", m.campaignId);
    const q = params.toString();
    router.push(q ? `/campanas?${q}` : "/campanas");
  }

  function reset(): void {
    setPeriod(CAMPANAS_DEFAULT_PERIOD);
    setDateFrom("");
    setDateTo("");
    setMarca("");
    setLineOfBusiness("");
    setCampaignId("");
    router.push("/campanas");
  }

  const selectClass = "rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white";

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Periodo</label>
        <select
          value={period}
          onChange={(e) => {
            const v = e.target.value;
            setPeriod(v);
            if (v !== "custom") applyWith({ period: v, dateFrom: "", dateTo: "" });
          }}
          className={`${selectClass} min-w-[11rem]`}
        >
          {CAMPANAS_PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {period === "custom" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              onBlur={(e) => applyWith({ dateFrom: e.target.value })}
              className={selectClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onBlur={(e) => applyWith({ dateTo: e.target.value })}
              className={selectClass}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Marca</label>
        <select
          value={marca}
          onChange={(e) => {
            const v = e.target.value;
            setMarca(v);
            setLineOfBusiness("");
            applyWith({ marca: v, lineOfBusiness: "" });
          }}
          className={`${selectClass} min-w-[12rem]`}
        >
          <option value="">Todas</option>
          {marcas.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Línea de negocio</label>
        <select
          value={lineOfBusiness}
          onChange={(e) => {
            const v = e.target.value;
            setLineOfBusiness(v);
            applyWith({ lineOfBusiness: v });
          }}
          className={`${selectClass} min-w-[10rem]`}
        >
          <option value="">Todas</option>
          {lines.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Campaña</label>
        <select
          value={campaignId}
          onChange={(e) => {
            const v = e.target.value;
            setCampaignId(v);
            applyWith({ campaignId: v });
          }}
          className={`${selectClass} min-w-[14rem] max-w-[22rem]`}
        >
          <option value="">Todas</option>
          {campaigns.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        Limpiar
      </button>
    </div>
  );
}
