"use client";

import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { CampaignSeriesPoint } from "@/lib/kpis/types";

type Overlay = "volume" | "ctr" | "cpc";

const OVERLAYS: { value: Overlay; label: string }[] = [
  { value: "volume", label: "Clics y leads" },
  { value: "ctr", label: "CTR" },
  { value: "cpc", label: "CPC" },
];

const LEGEND_LABELS: Record<string, string> = {
  costEur: "Gasto (€)",
  clicks: "Clics",
  leadsCrm: "Leads CRM",
  ctrPct: "CTR (%)",
  cpcEur: "CPC (€)",
};

const fmtMaybeCurrency = (v: number | null): string => (v === null ? "—" : formatCurrency(v));
const fmtMaybePct = (v: number | null): string => (v === null ? "—" : formatPercent(v));

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ payload: CampaignSeriesPoint }>;
  label?: string;
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="min-w-[220px] rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-lg">
      <p className="mb-2 font-semibold text-gray-700">{label}</p>
      <p className="text-indigo-600">Gasto: {formatCurrency(p.costEur)}</p>
      <p className="text-gray-600">
        {formatNumber(p.impressions)} impr. · {formatNumber(p.clicks)} clics · CTR {fmtMaybePct(p.ctrPct)}
      </p>
      <p className="text-gray-600">CPC: {fmtMaybeCurrency(p.cpcEur)}</p>
      <div className="mt-1.5 border-t border-gray-100 pt-1.5">
        <p className="text-emerald-700">
          Leads CRM: {p.leadsCrm} · conv. {fmtMaybePct(p.convRateCrmPct)} · CPL {fmtMaybeCurrency(p.cplCrmEur)}
        </p>
        <p className="text-xs text-gray-500">
          Google Ads: {formatNumber(p.conversionsAds, { decimals: 1 })} conv. · CPL {fmtMaybeCurrency(p.cplAdsEur)}
        </p>
      </div>
    </div>
  );
}

/**
 * Evolución de la campaña (patrón de cashflow-chart.tsx): barras de gasto en el eje
 * izquierdo y, en el derecho, lo que se elija — clics y leads, CTR o CPC. El histórico
 * es lo que pidió Jaume en la reunión del 2026-10-16: ver cómo fluctúan los KPIs sin
 * entrar en Google Ads.
 */
export function CampanasChart({ data, height = 320 }: { data: CampaignSeriesPoint[]; height?: number }): React.JSX.Element {
  const [overlay, setOverlay] = useState<Overlay>("volume");

  if (data.length === 0 || data.every((p) => p.impressions === 0 && p.costEur === 0 && p.leadsCrm === 0)) {
    return <div className="flex h-64 items-center justify-center text-sm text-gray-400">Sin datos para los filtros seleccionados</div>;
  }

  const rightFormatter = (v: number): string =>
    overlay === "ctr" ? `${v.toFixed(0)} %` : overlay === "cpc" ? `${v.toFixed(1)} €` : formatNumber(v);

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <div className="flex overflow-hidden rounded-lg border border-gray-300 text-xs">
          {OVERLAYS.map((o, i) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setOverlay(o.value)}
              className={`px-2.5 py-1 transition-colors ${i > 0 ? "border-l border-gray-300" : ""} ${
                overlay === o.value ? "bg-indigo-600 font-medium text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
          <YAxis
            yAxisId="left"
            tickFormatter={(v: number) => `${v.toFixed(0)} €`}
            tick={{ fontSize: 12, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={rightFormatter}
            tick={{ fontSize: 12, fill: "#6b7280" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend formatter={(value: string) => LEGEND_LABELS[value] ?? value} wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="costEur" fill="#6366f1" maxBarSize={40} radius={[4, 4, 0, 0]} />
          {overlay === "volume" && (
            <>
              <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="leadsCrm" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </>
          )}
          {overlay === "ctr" && (
            <Line yAxisId="right" type="monotone" dataKey="ctrPct" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
          )}
          {overlay === "cpc" && (
            <Line yAxisId="right" type="monotone" dataKey="cpcEur" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
