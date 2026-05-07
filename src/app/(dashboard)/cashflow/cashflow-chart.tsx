"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

export type CashflowMonthlyPoint = {
  monthKey: string;
  monthLabel: string;
  inflowsBase: number;
  inflowsTax: number;
  inflows: number;
  outflowsBase: number;
  outflowsTax: number;
  outflows: number;
  net: number;
};

type TooltipEntry = { name: string; value: number; color: string; dataKey: string };

type ChartClickData = {
  activePayload?: Array<{ payload: CashflowMonthlyPoint }>;
} | null;

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null;

  const find = (key: string): number =>
    (payload.find((p) => p.dataKey === key)?.value as number) ?? 0;

  const inflowsBase = find("inflowsBase");
  const inflowsTax = find("inflowsTax");
  const outflowsBase = find("outflowsBase");
  const outflowsTax = find("outflowsTax");
  const inflows = inflowsBase + inflowsTax;
  const outflows = outflowsBase + outflowsTax;
  const net = inflows - outflows;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-[210px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {inflows > 0 && (
        <div className="mb-1.5">
          <p className="text-green-600 font-medium">Entradas: {formatCurrency(inflows)}</p>
          <p className="text-xs text-gray-500 ml-2 mt-0.5">
            Base: {formatCurrency(inflowsBase)} · IVA: {formatCurrency(inflowsTax)}
          </p>
        </div>
      )}
      {outflows > 0 && (
        <div className="mb-1.5">
          <p className="text-red-500 font-medium">Salidas: {formatCurrency(outflows)}</p>
          <p className="text-xs text-gray-500 ml-2 mt-0.5">
            Base: {formatCurrency(outflowsBase)} · IVA: {formatCurrency(outflowsTax)}
          </p>
        </div>
      )}
      <p className={`font-medium mt-1 border-t border-gray-100 pt-1.5 ${net >= 0 ? "text-indigo-600" : "text-red-600"}`}>
        Neto: {formatCurrency(net)}
      </p>
      <p className="text-xs text-gray-400 mt-1">Haz clic para ver facturas</p>
    </div>
  );
}

const LEGEND_LABELS: Record<string, string> = {
  inflowsBase: "Entradas (base)",
  inflowsTax: "Entradas (IVA)",
  outflowsBase: "Salidas (base)",
  outflowsTax: "Salidas (IVA)",
};

export function CashflowChart({
  data,
  height = 350,
}: {
  data: CashflowMonthlyPoint[];
  height?: number;
}): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();
  const selectedMonth = sp.get("selectedMonth") ?? undefined;

  function handleClick(chartData: ChartClickData): void {
    if (!chartData?.activePayload?.[0]) return;
    const key = chartData.activePayload[0].payload.monthKey;
    const next = new URLSearchParams(sp.toString());
    if (next.get("selectedMonth") === key) {
      next.delete("selectedMonth");
    } else {
      next.set("selectedMonth", key);
    }
    router.push(`/cashflow?${next.toString()}`);
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Sin datos para los filtros seleccionados
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        onClick={handleClick}
        style={{ cursor: "pointer" }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="monthLabel"
          tick={{ fontSize: 12, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 12, fill: "#6b7280" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value: string) => LEGEND_LABELS[value] ?? value}
          wrapperStyle={{ fontSize: 12 }}
        />

        {/* Inflows: base bottom, tax top */}
        <Bar dataKey="inflowsBase" stackId="inflows" maxBarSize={48}>
          {data.map((entry) => (
            <Cell
              key={entry.monthKey}
              fill={selectedMonth === entry.monthKey ? "#16a34a" : "#22c55e"}
              opacity={selectedMonth && selectedMonth !== entry.monthKey ? 0.35 : 1}
            />
          ))}
        </Bar>
        <Bar dataKey="inflowsTax" stackId="inflows" maxBarSize={48} radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.monthKey}
              fill={selectedMonth === entry.monthKey ? "#4ade80" : "#86efac"}
              opacity={selectedMonth && selectedMonth !== entry.monthKey ? 0.35 : 1}
            />
          ))}
        </Bar>

        {/* Outflows: base bottom, tax top */}
        <Bar dataKey="outflowsBase" stackId="outflows" maxBarSize={48}>
          {data.map((entry) => (
            <Cell
              key={entry.monthKey}
              fill={selectedMonth === entry.monthKey ? "#dc2626" : "#ef4444"}
              opacity={selectedMonth && selectedMonth !== entry.monthKey ? 0.35 : 1}
            />
          ))}
        </Bar>
        <Bar dataKey="outflowsTax" stackId="outflows" maxBarSize={48} radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.monthKey}
              fill={selectedMonth === entry.monthKey ? "#f87171" : "#fca5a5"}
              opacity={selectedMonth && selectedMonth !== entry.monthKey ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
