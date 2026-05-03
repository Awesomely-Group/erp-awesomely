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
  inflows: number;
  outflows: number;
  net: number;
};

type ChartClickData = {
  activePayload?: Array<{ payload: CashflowMonthlyPoint }>;
} | null;

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}): React.JSX.Element | null {
  if (!active || !payload?.length) return null;

  const inflows = payload.find((p) => p.name === "inflows");
  const outflows = payload.find((p) => p.name === "outflows");
  const net = (inflows?.value ?? 0) - (outflows?.value ?? 0);

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {inflows && (
        <p className="text-green-600">
          Entradas: {formatCurrency(inflows.value)}
        </p>
      )}
      {outflows && (
        <p className="text-red-500">
          Salidas: {formatCurrency(outflows.value)}
        </p>
      )}
      <p className={net >= 0 ? "text-indigo-600 font-medium mt-1" : "text-red-600 font-medium mt-1"}>
        Neto: {formatCurrency(net)}
      </p>
      <p className="text-xs text-gray-400 mt-1">Haz clic para ver facturas</p>
    </div>
  );
}

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
          formatter={(value: string) =>
            value === "inflows" ? "Entradas" : "Salidas"
          }
          wrapperStyle={{ fontSize: 13 }}
        />
        <Bar dataKey="inflows" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((entry) => (
            <Cell
              key={entry.monthKey}
              fill={selectedMonth === entry.monthKey ? "#16a34a" : "#22c55e"}
              opacity={selectedMonth && selectedMonth !== entry.monthKey ? 0.35 : 1}
            />
          ))}
        </Bar>
        <Bar dataKey="outflows" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((entry) => (
            <Cell
              key={entry.monthKey}
              fill={selectedMonth === entry.monthKey ? "#dc2626" : "#ef4444"}
              opacity={selectedMonth && selectedMonth !== entry.monthKey ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
