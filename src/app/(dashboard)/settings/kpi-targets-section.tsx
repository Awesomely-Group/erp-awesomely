"use client";

import { useState, useTransition } from "react";
import { MARCA_OPTIONS } from "@/lib/org";
import { createKpiTarget, deleteKpiTarget } from "./kpi-targets-actions";
import type { KpiTargetPeriodType } from "@prisma/client";

export interface KpiTargetRow {
  id: string;
  metric: string;
  marca: string | null;
  lineOfBusiness: string | null;
  periodType: KpiTargetPeriodType;
  periodKey: string;
  value: number;
}

const PERIOD_LABEL: Record<KpiTargetPeriodType, string> = {
  MONTH: "Mes",
  QUARTER: "Trimestre",
  YEAR: "Año",
};

const METRIC_SUGGESTIONS = [
  "leads_mes",
  "demos_mes",
  "propuestas_enviadas",
  "win_rate_pct",
  "ticket_medio",
  "ciclo_venta_dias",
  "pipeline_ponderado",
];

export function KpiTargetsSection({ targets }: { targets: KpiTargetRow[] }): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [metric, setMetric] = useState("");
  const [marca, setMarca] = useState("");
  const [lineOfBusiness, setLineOfBusiness] = useState("");
  const [periodType, setPeriodType] = useState<KpiTargetPeriodType>("MONTH");
  const [periodKey, setPeriodKey] = useState("");
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!metric.trim() || !periodKey.trim() || !value) return;
    startTransition(async () => {
      await createKpiTarget({
        metric: metric.trim(),
        marca: marca || null,
        lineOfBusiness: lineOfBusiness || null,
        periodType,
        periodKey: periodKey.trim(),
        value: Number(value),
      });
      setMetric("");
      setPeriodKey("");
      setValue("");
    });
  }

  function handleDelete(id: string): void {
    startTransition(async () => {
      await deleteKpiTarget(id);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Metas por métrica/marca/línea de negocio/periodo. Alimentan el semáforo del pipeline en{" "}
        <code className="rounded bg-gray-100 px-1">/crm</code>. Sin valores por defecto: las
        cifras del plan de activación de Odoo son una plantilla sin aprobar.
      </p>

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 p-3 md:grid-cols-6">
        <input
          list="metric-suggestions"
          className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="Métrica (p.ej. leads_mes)"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        />
        <datalist id="metric-suggestions">
          {METRIC_SUGGESTIONS.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <select
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
        >
          <option value="">Todas las marcas</option>
          {MARCA_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="Línea (opcional)"
          value={lineOfBusiness}
          onChange={(e) => setLineOfBusiness(e.target.value)}
        />
        <select
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value as KpiTargetPeriodType)}
        >
          {Object.entries(PERIOD_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="Periodo (2026-09, 2026-Q3, 2026)"
          value={periodKey}
          onChange={(e) => setPeriodKey(e.target.value)}
        />
        <input
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="Valor meta"
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          disabled={isPending}
          className="col-span-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 md:col-span-1"
        >
          Añadir
        </button>
      </form>

      <table className="w-full text-sm">
        <thead className="text-left text-xs font-semibold uppercase text-gray-500">
          <tr>
            <th className="px-2 py-1">Métrica</th>
            <th className="px-2 py-1">Marca</th>
            <th className="px-2 py-1">Línea</th>
            <th className="px-2 py-1">Periodo</th>
            <th className="px-2 py-1">Meta</th>
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {targets.map((t) => (
            <tr key={t.id}>
              <td className="px-2 py-1 font-medium text-gray-900">{t.metric}</td>
              <td className="px-2 py-1 text-gray-500">{t.marca ?? "Todas"}</td>
              <td className="px-2 py-1 text-gray-500">{t.lineOfBusiness ?? "—"}</td>
              <td className="px-2 py-1 text-gray-500">
                {PERIOD_LABEL[t.periodType]} {t.periodKey}
              </td>
              <td className="px-2 py-1 text-gray-900">{t.value}</td>
              <td className="px-2 py-1 text-right">
                <button
                  onClick={() => handleDelete(t.id)}
                  disabled={isPending}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {targets.length === 0 && (
            <tr>
              <td colSpan={6} className="px-2 py-4 text-center text-xs text-gray-400">
                Sin metas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
