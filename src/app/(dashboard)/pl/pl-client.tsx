"use client";

import { cn } from "@/lib/utils";
import { PL_LINE_DEFS } from "@/lib/pl-data";
import type { PlEntityData, PlLineKey } from "@/lib/pl-data";

interface PlTableProps {
  entity: PlEntityData;
}

function fmtCell(n: number): string {
  if (n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(".", ",")}M`;
  if (abs >= 1_000)     return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);
  return `${Math.round(n)}`;
}

function fmtPct(value: number, ventas: number): string {
  if (ventas === 0) return "—";
  return `${((value / ventas) * 100).toFixed(1)}%`;
}

function CellValue({ value, isSubtotal }: { value: number; isSubtotal: boolean }): React.JSX.Element {
  if (value === 0) return <span className={isSubtotal ? "text-white/40" : "text-gray-200"}>—</span>;
  const positive = value > 0;
  if (isSubtotal) {
    return <span className={cn("tabular-nums font-semibold", positive ? "text-white" : "text-red-300")}>{fmtCell(value)}</span>;
  }
  return <span className={cn("tabular-nums", positive ? "text-gray-800" : "text-red-500")}>{fmtCell(value)}</span>;
}

function PctCell({ value, ventas, isSubtotal }: { value: number; ventas: number; isSubtotal: boolean }): React.JSX.Element {
  const pct = ventas > 0 ? (value / ventas) * 100 : null;
  if (pct === null) return <span className={isSubtotal ? "text-white/30" : "text-gray-300"}>—</span>;
  return (
    <span className={cn(
      "tabular-nums text-xs",
      isSubtotal
        ? pct >= 0 ? "text-white/80" : "text-red-300"
        : pct >= 0 ? "text-gray-400" : "text-red-400",
    )}>
      {fmtPct(value, ventas)}
    </span>
  );
}

const MONTH_LABELS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

export function PlTable({ entity }: PlTableProps): React.JSX.Element {
  const { months, yearly } = entity;
  const yearlyVentas = yearly.ventas;

  return (
    <table className="w-full table-fixed text-sm border-collapse">
      <colgroup>
        <col className="w-52" />
        {MONTH_LABELS.map((m) => <col key={m} />)}
        <col className="w-28" />
        <col className="w-16" />
      </colgroup>
      <thead>
        <tr className="border-b-2 border-gray-200 bg-gray-50">
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide" />
          {MONTH_LABELS.map((m) => (
            <th key={m} className="px-1 py-2.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {m}
            </th>
          ))}
          <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wide">
            TOTAL
          </th>
          <th className="px-2 py-2.5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide">
            %
          </th>
        </tr>
      </thead>
      <tbody>
        {PL_LINE_DEFS.map((def) => {
          const isSubtotal = def.type === "subtotal";

          if (isSubtotal) {
            return (
              <tr key={def.key} className="bg-indigo-800 border-t border-indigo-700">
                <td className="px-4 py-3 font-bold text-white text-sm">
                  {def.label}
                </td>
                {months.map((m) => (
                  <td key={m.monthKey} className="px-1 py-3 text-right">
                    <CellValue value={m.lines[def.key as PlLineKey]} isSubtotal />
                  </td>
                ))}
                <td className="px-3 py-3 text-right">
                  <CellValue value={yearly[def.key as PlLineKey]} isSubtotal />
                </td>
                <td className="px-2 py-3 text-right">
                  <PctCell value={yearly[def.key as PlLineKey]} ventas={yearlyVentas} isSubtotal />
                </td>
              </tr>
            );
          }

          return (
            <tr key={def.key} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
              <td className="px-4 py-2.5 text-gray-700 font-medium truncate">{def.label}</td>
              {months.map((m) => (
                <td key={m.monthKey} className="px-1 py-2.5 text-right">
                  <CellValue value={m.lines[def.key as PlLineKey]} isSubtotal={false} />
                </td>
              ))}
              <td className="px-3 py-2.5 text-right font-semibold">
                <CellValue value={yearly[def.key as PlLineKey]} isSubtotal={false} />
              </td>
              <td className="px-2 py-2.5 text-right">
                <PctCell value={yearly[def.key as PlLineKey]} ventas={yearlyVentas} isSubtotal={false} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
