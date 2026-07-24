"use client";

import { useState } from "react";
import type { TesoreriaData, TesoreriaEntityData, TesoreriaMonth } from "@/lib/tesoreria-data";

function fmt(v: number): string {
  const abs = Math.abs(Math.round(v));
  const s = abs.toLocaleString("es-ES");
  if (v < -0.5) return `(${s})`;
  if (v < 0.5) return "—";
  return s;
}

function fmtSign(v: number): string {
  if (Math.abs(v) < 0.5) return "—";
  const abs = Math.abs(Math.round(v));
  return (v < 0 ? "−" : "+") + abs.toLocaleString("es-ES");
}

type Entity = "Consolidado" | "SL" | "OU";

const ENTITY_LABELS: Record<Entity, string> = {
  Consolidado: "Consolidado",
  SL: "Awesomely SL",
  OU: "Awesomely OÜ",
};

interface Props {
  data: TesoreriaData;
}

type RowDef = {
  key: string;
  label: string;
  getValue: (m: TesoreriaMonth) => number | null;
  getTotal: (d: TesoreriaEntityData) => number;
  style: "header" | "sub" | "net" | "saldo";
  sign?: "positive" | "negative" | "net"; // color coding
};

const ROWS: RowDef[] = [
  {
    key: "cobros",
    label: "COBROS",
    getValue: (m) => m.cobros,
    getTotal: (d) => d.totalCobros,
    style: "header",
    sign: "positive",
  },
  {
    key: "cobrosAsegurado",
    label: "  · Asegurado (proformas)",
    getValue: (m) => m.cobrosAsegurado,
    getTotal: (d) => d.months.filter((x) => x.cobrosAsegurado !== null).reduce((s, x) => s + (x.cobrosAsegurado ?? 0), 0),
    style: "sub",
  },
  {
    key: "cobrosEstimado",
    label: "  · Estimado histórico",
    getValue: (m) => m.cobrosEstimado,
    getTotal: (d) => d.months.filter((x) => x.cobrosEstimado !== null).reduce((s, x) => s + (x.cobrosEstimado ?? 0), 0),
    style: "sub",
  },
  {
    key: "pagos",
    label: "PAGOS",
    getValue: (m) => m.pagos,
    getTotal: (d) => d.totalPagos,
    style: "header",
    sign: "negative",
  },
  {
    key: "pagosEstructura",
    label: "  · Estructura comprometida",
    getValue: (m) => m.pagosEstructura,
    getTotal: (d) => d.months.filter((x) => x.pagosEstructura !== null).reduce((s, x) => s + (x.pagosEstructura ?? 0), 0),
    style: "sub",
  },
  {
    key: "pagosExtraordinarios",
    label: "  · Extraordinarios",
    getValue: (m) => m.pagosExtraordinarios,
    getTotal: (d) => d.months.filter((x) => x.pagosExtraordinarios !== null).reduce((s, x) => s + (x.pagosExtraordinarios ?? 0), 0),
    style: "sub",
  },
  {
    key: "pagosVariable",
    label: "  · Estimado histórico",
    getValue: (m) => m.pagosVariable,
    getTotal: (d) => d.months.filter((x) => x.pagosVariable !== null).reduce((s, x) => s + (x.pagosVariable ?? 0), 0),
    style: "sub",
  },
  {
    key: "flujoNeto",
    label: "FLUJO NETO",
    getValue: (m) => m.flujoNeto,
    getTotal: (d) => d.totalFlujo,
    style: "net",
    sign: "net",
  },
  {
    key: "saldoCaja",
    label: "SALDO CAJA fin de mes",
    getValue: (m) => m.saldoCaja,
    getTotal: (d) => d.months[11]?.saldoCaja ?? 0,
    style: "saldo",
  },
];

function cellColor(val: number | null, sign?: "positive" | "negative" | "net"): string {
  if (val === null || Math.abs(val) < 0.5) return "text-gray-300";
  if (!sign) return "text-gray-700";
  if (sign === "positive") return "text-emerald-700";
  if (sign === "negative") return val < 0 ? "text-red-600" : "text-emerald-700";
  if (sign === "net") return val >= 0 ? "text-indigo-700" : "text-red-600";
  return "text-gray-700";
}

function rowClasses(style: RowDef["style"]): string {
  switch (style) {
    case "header": return "bg-gray-50 font-semibold";
    case "sub":    return "bg-white text-gray-500 text-xs";
    case "net":    return "bg-indigo-50 font-semibold";
    case "saldo":  return "bg-slate-50 font-bold text-sm";
  }
}

export function TesoreriaView({ data }: Props): React.JSX.Element {
  const [entity, setEntity] = useState<Entity>("Consolidado");
  const entityData = data[entity];

  return (
    <div className="space-y-4">
      {/* Entity tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(["Consolidado", "SL", "OU"] as Entity[]).map((e) => (
          <button
            key={e}
            onClick={() => setEntity(e)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              entity === e
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {ENTITY_LABELS[e]}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-white border border-gray-200 inline-block" />
          REAL (ene–jun ERP)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block" />
          PREVISIÓN (jul–dic hardcoded)
        </span>
        <span className="text-gray-300">· Importes en € con IVA</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-52 sticky left-0 bg-white z-10">
                Concepto
              </th>
              {entityData.months.map((m) => (
                <th
                  key={m.monthKey}
                  className={`px-2 py-2.5 text-right text-xs font-medium text-gray-500 ${
                    m.isReal ? "" : "bg-amber-50/60"
                  }`}
                >
                  {m.monthLabel}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-600 bg-gray-50">
                Año
              </th>
            </tr>
            <tr className="border-b border-gray-200">
              <th className="sticky left-0 bg-white z-10" />
              {entityData.months.map((m) => (
                <th
                  key={m.monthKey}
                  className={`px-2 py-1 text-center text-[10px] font-normal ${
                    m.isReal
                      ? "text-gray-400"
                      : "text-amber-500 bg-amber-50/60"
                  }`}
                >
                  {m.isReal ? "" : "prev."}
                </th>
              ))}
              <th className="bg-gray-50" />
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const isSubRow = row.style === "sub";
              const allNull = entityData.months.every((m) => row.getValue(m) === null);
              if (isSubRow && allNull) return null;

              return (
                <tr
                  key={row.key}
                  className={`border-b border-gray-50 last:border-0 ${rowClasses(row.style)}`}
                >
                  <td
                    className={`px-4 py-2 text-left sticky left-0 z-10 ${rowClasses(row.style)} border-r border-gray-100`}
                  >
                    {row.label}
                  </td>
                  {entityData.months.map((m) => {
                    const val = row.getValue(m);
                    const isPrevisión = !m.isReal;
                    const displayVal = val !== null ? (row.sign ? fmtSign(val) : fmt(val)) : "—";
                    return (
                      <td
                        key={m.monthKey}
                        className={`px-2 py-2 text-right tabular-nums ${
                          isPrevisión ? "bg-amber-50/40" : ""
                        } ${cellColor(val, row.sign)}`}
                      >
                        {displayVal}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold bg-gray-50 ${cellColor(row.getTotal(entityData), row.sign)}`}>
                    {row.sign ? fmtSign(row.getTotal(entityData)) : fmt(row.getTotal(entityData))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Saldo inicial 1-ene-2026: SL {data.SL.months[0] ? fmt(data.SL.months[0].saldoCaja - data.SL.months[0].flujoNeto) : "—"} €
        · OÜ {data.OU.months[0] ? fmt(data.OU.months[0].saldoCaja - data.OU.months[0].flujoNeto) : "—"} €
        · REAL = facturas emitidas/recibidas por fecha · PREVISIÓN = promedios histórico + proformas contratadas jun-2026
      </p>
    </div>
  );
}
