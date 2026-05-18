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
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "red" | "green";
}): React.JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex flex-col gap-1">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
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

function CostTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      <p className="text-red-600">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

interface Props {
  projectId: string;
  hasTempoToken: boolean;
  from: string;
  to: string;
  totalInvoicesEur: number;
}

export function ProjectOverviewCharts({ projectId, hasTempoToken, from, to, totalInvoicesEur }: Props): React.JSX.Element {
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

  if (!hasTempoToken) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-8 text-center text-sm text-gray-400">
        Token de Tempo no configurado.{" "}
        <a href="/settings" className="text-indigo-600 hover:underline">Configúralo en Configuración</a>.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 flex items-center justify-center gap-2 text-sm text-gray-400">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        Cargando resumen...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-6 text-sm text-red-500">
        Error: {error}
      </div>
    );
  }

  if (!data || (data.totalHours === 0 && data.months.length === 0)) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-10 text-center text-sm text-gray-400">
        Sin horas registradas en este período
      </div>
    );
  }

  const beneficioReal = totalInvoicesEur - data.totalCost;
  const margenReal = totalInvoicesEur > 0 ? (beneficioReal / totalInvoicesEur) * 100 : null;

  const hasEstimate = data.estimateCost != null && data.estimateCost > 0;
  const beneficioEsperado = hasEstimate ? totalInvoicesEur - data.estimateCost! : null;
  const margenEsperado = beneficioEsperado != null && totalInvoicesEur > 0
    ? (beneficioEsperado / totalInvoicesEur) * 100
    : null;
  const desvCoste = hasEstimate
    ? ((data.totalCost - data.estimateCost!) / data.estimateCost!) * 100
    : null;

  const avgEstimateCostPerMonth = hasEstimate && data.months.length > 0
    ? data.estimateCost! / data.months.length
    : null;

  const chartData = data.months.map((m) => ({
    ...m,
    monthLabel: monthLabel(m.month),
  }));

  return (
    <div className="space-y-3">
      {/* Sección 1: Resultado del período */}
      <SectionLabel>Resultado del período</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Ingresos"
          value={formatCurrency(totalInvoicesEur)}
        />
        <KpiCard
          label="Coste real"
          value={formatCurrency(data.totalCost)}
          accent="red"
        />
        <KpiCard
          label="Beneficio real"
          value={formatCurrency(beneficioReal)}
          accent={beneficioReal >= 0 ? "green" : "red"}
          sub={margenReal != null ? `${margenReal.toFixed(1)}% margen` : undefined}
        />
        <KpiCard
          label="Margen real"
          value={margenReal != null ? `${margenReal.toFixed(1)}%` : "—"}
          accent={margenReal == null ? undefined : margenReal >= 0 ? "green" : "red"}
          sub="sobre ingresos"
        />
      </div>

      {/* Sección 2: Previsión vs Real (solo si hay estimación) */}
      {hasEstimate && (
        <>
          <SectionLabel>Previsión vs Real</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Coste estimado"
              value={formatCurrency(data.estimateCost!)}
              accent="red"
            />
            <KpiCard
              label="Beneficio esperado"
              value={beneficioEsperado != null ? formatCurrency(beneficioEsperado) : "—"}
              accent={beneficioEsperado == null ? undefined : beneficioEsperado >= 0 ? "green" : "red"}
              sub={margenEsperado != null ? `${margenEsperado.toFixed(1)}% margen` : undefined}
            />
            <KpiCard
              label="Desviación coste"
              value={desvCoste != null ? `${desvCoste >= 0 ? "+" : ""}${desvCoste.toFixed(1)}%` : "—"}
              accent={desvCoste == null ? undefined : desvCoste > 0 ? "red" : "green"}
              sub={desvCoste != null ? (desvCoste > 0 ? "Por encima del estimado" : "Dentro del estimado") : undefined}
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
            />
          </div>
        </>
      )}

      {/* Chart: Coste por mes (full width, barras rojas) */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-4">Coste por mes</p>
          <ResponsiveContainer width="100%" height={200}>
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
              <Tooltip content={<CostTooltip />} />
              <Bar dataKey="totalCost" fill="#ef4444" maxBarSize={40} radius={[4, 4, 0, 0]} />
              {avgEstimateCostPerMonth != null && (
                <ReferenceLine
                  y={avgEstimateCostPerMonth}
                  stroke="#fca5a5"
                  strokeDasharray="4 3"
                  label={{ value: "Est.", position: "insideTopRight", fontSize: 10, fill: "#f87171" }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
