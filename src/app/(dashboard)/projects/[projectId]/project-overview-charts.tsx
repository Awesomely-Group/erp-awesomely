"use client";

import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface MonthCostData {
  months: Array<{ month: string; totalHours: number; totalCost: number }>;
  totalHours: number;
  totalCost: number;
  estimateHours: number | null;
  estimateCost: number | null;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const d = new Date(Number(year), Number(m) - 1, 1);
  return d.toLocaleDateString("es-ES", { month: "short", year: "2-digit" });
}

function KpiCard({
  label,
  value,
  sub,
  accent,
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "red" | "green";
  tooltip?: string;
}): React.JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
        {tooltip && (
          <div className="relative group/tip">
            <svg className="w-3 h-3 text-gray-300 hover:text-gray-500 cursor-help flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
            </svg>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tip:block z-20 w-60 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl pointer-events-none leading-relaxed">
              {tooltip}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
            </div>
          </div>
        )}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${
        accent === "red" ? "text-red-600" : accent === "green" ? "text-green-600" : "text-gray-900"
      }`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

function SectionLabel({ children }: { children: string }): React.JSX.Element {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{children}</p>
  );
}

type TooltipPayloadEntry = { dataKey: string; value: number };

function MultiTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  const find = (key: string): number => payload.find((p) => p.dataKey === key)?.value ?? 0;
  const sale = find("totalSale");
  const purchase = find("totalPurchase");
  const cost = find("totalCost");
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm space-y-0.5">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {sale > 0 && <p className="text-green-600">Ingresos: {formatCurrency(sale)}</p>}
      {purchase > 0 && <p className="text-red-500">Gastos: {formatCurrency(purchase)}</p>}
      {cost > 0 && <p className="text-indigo-600">Coste personal: {formatCurrency(cost)}</p>}
    </div>
  );
}

interface Props {
  projectId: string;
  hasTempoToken: boolean;
  from: string;
  to: string;
  totalInvoicesEur: number;
  invoicesByMonth: Array<{ month: string; totalSale: number; totalPurchase: number }>;
  totalExpensesEur: number;
}

export function ProjectOverviewCharts({
  projectId,
  hasTempoToken,
  from,
  to,
  totalInvoicesEur,
  invoicesByMonth,
  totalExpensesEur,
}: Props): React.JSX.Element {
  const [data, setData] = useState<MonthCostData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasTempoToken) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    async function load(): Promise<void> {
      try {
        const res = await fetch(
          `/api/tempo/worklogs?projectId=${projectId}&from=${from}&to=${to}&groupBy=month-cost`
        );
        const text = await res.text();
        let parsed: unknown;
        try { parsed = JSON.parse(text); } catch { throw new Error(`Error ${res.status}`); }
        if (!res.ok) throw new Error((parsed as { error?: string }).error ?? `Error ${res.status}`);
        if (!cancelled) { setData(parsed as MonthCostData); setLoading(false); }
      } catch (e: unknown) {
        if (!cancelled) { setError(e instanceof Error ? e.message : "Error desconocido"); setLoading(false); }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [projectId, hasTempoToken, from, to]);

  if (!hasTempoToken && invoicesByMonth.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
        Token de Tempo no configurado.{" "}
        <a href="/settings" className="text-indigo-600 hover:underline">Configúralo en Configuración</a>.
      </div>
    );
  }

  const hasTempoData = data != null && (data.totalHours > 0 || data.months.length > 0);
  const hasInvoiceData = invoicesByMonth.length > 0;

  if (!loading && !error && !hasTempoData && !hasInvoiceData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center text-sm text-gray-400">
        Sin datos en este período
      </div>
    );
  }

  const tempoTotalCost = data?.totalCost ?? 0;
  const beneficioReal = totalInvoicesEur - totalExpensesEur;
  const margenReal = totalInvoicesEur > 0 ? (beneficioReal / totalInvoicesEur) * 100 : null;

  const hasEstimate = data?.estimateCost != null && data.estimateCost > 0;
  const beneficioEsperado = hasEstimate ? totalInvoicesEur - data!.estimateCost! : null;
  const margenEsperado = beneficioEsperado != null && totalInvoicesEur > 0
    ? (beneficioEsperado / totalInvoicesEur) * 100
    : null;
  const desvCoste = hasEstimate
    ? ((tempoTotalCost - data!.estimateCost!) / data!.estimateCost!) * 100
    : null;

  const avgEstimateCostPerMonth =
    hasEstimate && (data?.months.length ?? 0) > 0
      ? data!.estimateCost! / data!.months.length
      : null;

  const allMonths = Array.from(
    new Set([
      ...(data?.months.map((m) => m.month) ?? []),
      ...invoicesByMonth.map((m) => m.month),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const invoiceMap = new Map(invoicesByMonth.map((m) => [m.month, m]));

  const chartData = allMonths.map((month) => {
    const tempoMonth = data?.months.find((m) => m.month === month);
    const invoiceMonth = invoiceMap.get(month);
    return {
      month,
      monthLabel: monthLabel(month),
      totalCost: tempoMonth?.totalCost ?? 0,
      totalSale: invoiceMonth?.totalSale ?? 0,
      totalPurchase: invoiceMonth?.totalPurchase ?? 0,
    };
  });

  const legendFormatter = (value: string): string =>
    ({ totalSale: "Ingresos", totalPurchase: "Gastos", totalCost: "Coste personal" }[value] ?? value);

  return (
    <div className="space-y-3">
      {/* Sección 1: Resultado del período */}
      <SectionLabel>Resultado del período</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Ingresos"
          value={formatCurrency(totalInvoicesEur)}
          accent="green"
          tooltip="Suma de facturas de venta emitidas en el período seleccionado."
        />
        <KpiCard
          label="Gastos (facturas)"
          value={formatCurrency(totalExpensesEur)}
          accent="red"
          tooltip="Suma de facturas de compra recibidas en el período. Incluye el coste de personal facturado por proveedores y freelancers."
        />
        <KpiCard
          label="Coste real (personal)"
          value={loading ? "…" : formatCurrency(tempoTotalCost)}
          accent="red"
          tooltip="Coste interno del equipo: horas registradas en Tempo × tarifa/hora de cada persona. Métrica informativa — no se resta del beneficio porque ya está incluido en las facturas de compra."
        />
        <KpiCard
          label="Beneficio real"
          value={loading ? "…" : formatCurrency(beneficioReal)}
          accent={loading ? undefined : beneficioReal >= 0 ? "green" : "red"}
          sub={!loading && margenReal != null ? `${margenReal.toFixed(1)}% margen` : undefined}
          tooltip="Ingresos − Gastos (facturas). El coste de personal no se resta porque ya está capturado en las facturas de compra."
        />
        <KpiCard
          label="Margen real"
          value={loading ? "…" : margenReal != null ? `${margenReal.toFixed(1)}%` : "—"}
          accent={loading || margenReal == null ? undefined : margenReal >= 0 ? "green" : "red"}
          sub="sobre ingresos"
          tooltip="Beneficio real / Ingresos × 100. Indica qué porcentaje de los ingresos se convierte en beneficio."
        />
      </div>

      {/* Estado Tempo: cargando o error */}
      {loading && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Cargando datos de Tempo...
        </div>
      )}
      {error && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 text-sm text-red-500">
          Error Tempo: {error}
        </div>
      )}

      {/* Sección 2: Previsión vs Real (solo si hay estimación de Tempo) */}
      {hasEstimate && (
        <>
          <SectionLabel>Previsión vs Real</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Coste estimado"
              value={formatCurrency(data!.estimateCost!)}
              accent="red"
              tooltip="Estimación del coste de personal basada en las horas estimadas en Jira × la tarifa media real del equipo en este período."
            />
            <KpiCard
              label="Beneficio esperado"
              value={beneficioEsperado != null ? formatCurrency(beneficioEsperado) : "—"}
              accent={beneficioEsperado == null ? undefined : beneficioEsperado >= 0 ? "green" : "red"}
              sub={margenEsperado != null ? `${margenEsperado.toFixed(1)}% margen` : undefined}
              tooltip="Ingresos − Coste estimado de personal. Beneficio proyectado si el equipo hubiera ajustado exactamente a las estimaciones de Jira."
            />
            <KpiCard
              label="Desviación coste"
              value={desvCoste != null ? `${desvCoste >= 0 ? "+" : ""}${desvCoste.toFixed(1)}%` : "—"}
              accent={desvCoste == null ? undefined : desvCoste > 0 ? "red" : "green"}
              sub={desvCoste != null ? (desvCoste > 0 ? "Por encima del estimado" : "Dentro del estimado") : undefined}
              tooltip="(Coste real personal − Coste estimado) / Coste estimado × 100. Positivo = el equipo ha tardado más de lo estimado."
            />
            <KpiCard
              label="Desviación beneficio"
              value={beneficioEsperado != null
                ? `${(beneficioReal - beneficioEsperado) >= 0 ? "+" : ""}${formatCurrency(beneficioReal - beneficioEsperado)}`
                : "—"}
              accent={beneficioEsperado == null ? undefined : (beneficioReal - beneficioEsperado) >= 0 ? "green" : "red"}
              sub={beneficioEsperado != null && margenEsperado != null && margenReal != null
                ? `${(margenReal - margenEsperado) >= 0 ? "+" : ""}${(margenReal - margenEsperado).toFixed(1)}pp`
                : undefined}
              tooltip="Beneficio real − Beneficio esperado. Diferencia entre lo que realmente se ha ganado y lo que se proyectaba ganar según las estimaciones de Jira."
            />
          </div>
        </>
      )}

      {/* Chart: Ingresos, gastos y coste por mes */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-4">Ingresos y gastos por mes</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip content={<MultiTooltip />} />
              <Legend formatter={legendFormatter} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="totalSale" fill="#22c55e" maxBarSize={32} radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalPurchase" fill="#ef4444" maxBarSize={32} radius={[4, 4, 0, 0]} />
              <Bar dataKey="totalCost" fill="#6366f1" maxBarSize={32} radius={[4, 4, 0, 0]} />
              {avgEstimateCostPerMonth != null && (
                <ReferenceLine
                  y={avgEstimateCostPerMonth}
                  stroke="#a5b4fc"
                  strokeDasharray="4 3"
                  label={{ value: "Est.", position: "insideTopRight", fontSize: 10, fill: "#6366f1" }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
