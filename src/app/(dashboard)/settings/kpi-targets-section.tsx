"use client";

import { useState, useTransition } from "react";
import { MARCA_OPTIONS } from "@/lib/org";
import { applyAdsTargetDefaults, createKpiTarget, deleteKpiTarget, updateKpiTargetValue } from "./kpi-targets-actions";
import { ADS_TARGET_DEFAULTS, ADS_TARGET_PHASE_LABEL, ADS_TARGET_SCOPE, type AdsTargetPhase } from "@/lib/ads-targets-defaults";
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
  // Campañas de pago (/campanas, 2026-10-16). Las metas de Holdmin: CTR 6-8 % → 10-11 %,
  // conversión 6-8 % → 10 %, CPL ≈ 40 €, 6-10 leads/mes. CPC y CPL son "menos es mejor".
  "ads_ctr_pct",
  "ads_cpc_eur",
  "ads_conv_rate_pct",
  "ads_leads_mes",
  "ads_cpl_eur",
  "ads_cpl_cualificado_eur",
];

export function KpiTargetsSection({ targets }: { targets: KpiTargetRow[] }): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [metric, setMetric] = useState("");
  const [marca, setMarca] = useState("");
  const [lineOfBusiness, setLineOfBusiness] = useState("");
  const [periodType, setPeriodType] = useState<KpiTargetPeriodType>("MONTH");
  const [periodKey, setPeriodKey] = useState("");
  const [value, setValue] = useState("");
  const [adsPhase, setAdsPhase] = useState<AdsTargetPhase>("arranque");
  const [adsMonth, setAdsMonth] = useState(currentMonthKey());
  const [adsMessage, setAdsMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

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

  function startEdit(t: KpiTargetRow): void {
    setEditingId(t.id);
    setEditingValue(String(t.value));
  }

  function commitEdit(): void {
    const id = editingId;
    const next = Number(editingValue);
    if (!id || !Number.isFinite(next)) {
      setEditingId(null);
      return;
    }
    startTransition(async () => {
      await updateKpiTargetValue(id, next);
      setEditingId(null);
    });
  }

  function handleApplyAdsDefaults(): void {
    setAdsMessage(null);
    startTransition(async () => {
      try {
        const created = await applyAdsTargetDefaults(adsPhase, adsMonth);
        const total = ADS_TARGET_DEFAULTS[adsPhase].length;
        setAdsMessage(
          created === 0
            ? `Las ${total} metas de ${adsMonth} ya existían; no se ha tocado ninguna.`
            : `Creadas ${created} de ${total} metas para ${adsMonth}${created < total ? " (las demás ya existían y se respetan)" : ""}.`,
        );
      } catch (err) {
        setAdsMessage(err instanceof Error ? err.message : "No se pudieron cargar las metas");
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400">
        Metas por métrica/marca/línea de negocio/periodo. Alimentan el semáforo del pipeline en{" "}
        <code className="rounded bg-gray-100 px-1">/crm</code> y el de campañas de pago en{" "}
        <code className="rounded bg-gray-100 px-1">/campanas</code> (métricas <code className="rounded bg-gray-100 px-1">ads_*</code>). Las metas comerciales
        no tienen valores por defecto (las cifras del plan de activación de Odoo son una plantilla sin aprobar); las de campañas de pago sí: los
        números de la agencia, cargables abajo y editables después. Haz clic en una meta para cambiarla.
      </p>

      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
        <p className="text-xs font-medium text-gray-700">
          Metas de campañas de pago · {ADS_TARGET_SCOPE.marca} / {ADS_TARGET_SCOPE.lineOfBusiness}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Valores de Holdmin (reuniones 08/10 y 16/10/2026). Solo se crean las que no existan para ese mes; lo que ya hayas editado no se pisa.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={adsPhase}
            onChange={(e) => setAdsPhase(e.target.value as AdsTargetPhase)}
          >
            {(Object.keys(ADS_TARGET_PHASE_LABEL) as AdsTargetPhase[]).map((phase) => (
              <option key={phase} value={phase}>
                {ADS_TARGET_PHASE_LABEL[phase]}
              </option>
            ))}
          </select>
          <input
            type="month"
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            value={adsMonth}
            onChange={(e) => setAdsMonth(e.target.value)}
          />
          <button
            type="button"
            onClick={handleApplyAdsDefaults}
            disabled={isPending || !adsMonth}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Cargar metas del mes
          </button>
          <span className="text-xs text-gray-500">
            {ADS_TARGET_DEFAULTS[adsPhase].map((d) => `${d.label}: ${d.value}`).join(" · ")}
          </span>
        </div>
        {adsMessage && <p className="mt-2 text-xs text-gray-600">{adsMessage}</p>}
      </div>

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
              <td className="px-2 py-1 text-gray-900">
                {editingId === t.id ? (
                  <input
                    autoFocus
                    type="number"
                    step="any"
                    className="w-24 rounded-md border border-indigo-300 px-2 py-0.5 text-sm"
                    value={editingValue}
                    disabled={isPending}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    className="rounded px-1 text-left hover:bg-gray-100"
                    title="Editar meta"
                  >
                    {t.value}
                  </button>
                )}
              </td>
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

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
