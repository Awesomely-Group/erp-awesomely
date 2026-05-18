"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { ProjectionPoint } from "@/lib/projection-data";

type TooltipEntry = { dataKey: string; value: number };

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

  const bIn  = find("baselineInflows");
  const bOut = find("baselineOutflows");
  const bNet = find("baselineNet");
  const oNet = find("optimisticNet");
  const pNet = find("pessimisticNet");

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm min-w-[210px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      <div className="mb-1.5">
        <p className="text-green-600 font-medium">Entradas proyectadas: {formatCurrency(bIn)}</p>
        <p className="text-red-500 font-medium">Salidas proyectadas: {formatCurrency(bOut)}</p>
      </div>
      <div className="border-t border-gray-100 pt-1.5 space-y-0.5">
        <p className="text-green-700 font-medium">Neto optimista: {formatCurrency(oNet)}</p>
        <p className={`font-medium ${bNet >= 0 ? "text-indigo-600" : "text-red-600"}`}>
          Neto base: {formatCurrency(bNet)}
        </p>
        <p className="text-amber-600 font-medium">Neto pesimista: {formatCurrency(pNet)}</p>
      </div>
    </div>
  );
}

const LEGEND_LABELS: Record<string, string> = {
  baselineInflows:   "Entradas proyectadas",
  baselineOutflows:  "Salidas proyectadas",
  optimisticNet:     "Neto optimista",
  baselineNet:       "Neto base",
  pessimisticNet:    "Neto pesimista",
};

export function ProjectionChart({
  data,
  height = 380,
}: {
  data: ProjectionPoint[];
  height?: number;
}): React.JSX.Element {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-400">
        Sin datos históricos para proyectar
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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

        {/* Volumen proyectado: barras baseline */}
        <Bar
          dataKey="baselineInflows"
          stackId="in"
          maxBarSize={40}
          fill="#22c55e"
          fillOpacity={0.65}
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="baselineOutflows"
          stackId="out"
          maxBarSize={40}
          fill="#ef4444"
          fillOpacity={0.65}
          radius={[4, 4, 0, 0]}
        />

        {/* Neto: 3 líneas de escenario */}
        <Line
          dataKey="optimisticNet"
          stroke="#16a34a"
          strokeWidth={2}
          type="monotone"
          dot={false}
          isAnimationActive={false}
          legendType="line"
        />
        <Line
          dataKey="baselineNet"
          stroke="#6366f1"
          strokeWidth={2}
          type="monotone"
          dot={false}
          strokeDasharray="6 3"
          isAnimationActive={false}
          legendType="line"
        />
        <Line
          dataKey="pessimisticNet"
          stroke="#d97706"
          strokeWidth={2}
          type="monotone"
          dot={false}
          strokeDasharray="3 3"
          isAnimationActive={false}
          legendType="line"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
