"use client";

import { useState } from "react";
import type {
  PptoRealMarcaData,
  PlProjectRow,
  PlSummaryRow,
  PlCategoryRow,
} from "@/lib/ppto-real-data";

// ─── Formatting ───────────────────────────────────────────────────────────────

function fmt(v: number): string {
  const r = Math.round(v);
  if (r === 0) return "—";
  return r.toLocaleString("es-ES");
}

function fmtPct(v: number | null): string {
  if (v === null || isNaN(v) || !isFinite(v)) return "—";
  const r = Math.round(v * 100);
  return (r >= 0 ? "+" : "") + r + "%";
}

function desvColor(desv: number | null): string {
  if (desv === null || isNaN(desv as number)) return "text-gray-400";
  if ((desv as number) > 0) return "text-emerald-600";
  if ((desv as number) < 0) return "text-red-500";
  return "text-gray-500";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "LaTroupe" | "Gigson" | "Awesomely" | "Consolidado";

const TAB_LABELS: Record<Tab, string> = {
  LaTroupe: "LaTroupe",
  Gigson: "Gigson Solutions",
  Awesomely: "Awesomely",
  Consolidado: "Consolidado",
};

interface Props {
  data: {
    LaTroupe: PptoRealMarcaData;
    Gigson: PptoRealMarcaData;
    Awesomely: PptoRealMarcaData;
    Consolidado: PptoRealMarcaData;
  };
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];

// ─── Row components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }): React.JSX.Element {
  return (
    <tr className="bg-gray-100 border-y border-gray-200">
      <td colSpan={11} className="px-4 py-1.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
        {label}
      </td>
    </tr>
  );
}

function ProjectRow({ row }: { row: PlProjectRow }): React.JSX.Element {
  const desv = row.budget !== null ? row.total - row.budget : null;
  const desvPct = desv !== null && row.budget ? desv / row.budget : null;

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-2 text-gray-600 text-xs pl-7 sticky left-0 bg-white border-r border-gray-100">
        {row.projectName}
      </td>
      {row.months.map((v, i) => (
        <td key={i} className="px-2 py-2 text-right tabular-nums text-xs text-gray-700">
          {fmt(v)}
        </td>
      ))}
      <td className="px-2 py-2 text-right tabular-nums text-xs font-semibold text-gray-900 bg-gray-50/60">
        {fmt(row.total)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-xs text-gray-400">
        {row.budget !== null ? fmt(row.budget) : "—"}
      </td>
      <td className={`px-2 py-2 text-right tabular-nums text-xs ${desvColor(desv)}`}>
        {desv !== null ? fmt(desv) : "—"}
      </td>
      <td className={`px-2 py-2 text-right tabular-nums text-xs ${desvColor(desvPct)}`}>
        {fmtPct(desvPct)}
      </td>
    </tr>
  );
}

function CategoryRow({ row }: { row: PlCategoryRow }): React.JSX.Element {
  const desv = row.budget !== null ? row.total - row.budget : null;
  const desvPct = desv !== null && row.budget ? desv / row.budget : null;

  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td className="px-4 py-2 text-gray-600 text-xs pl-7 sticky left-0 bg-white border-r border-gray-100">
        {row.category}
      </td>
      {row.months.map((v, i) => (
        <td key={i} className="px-2 py-2 text-right tabular-nums text-xs text-gray-700">
          {fmt(v)}
        </td>
      ))}
      <td className="px-2 py-2 text-right tabular-nums text-xs font-semibold text-gray-900 bg-gray-50/60">
        {fmt(row.total)}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-xs text-gray-400">
        {row.budget !== null ? fmt(row.budget) : "—"}
      </td>
      <td className={`px-2 py-2 text-right tabular-nums text-xs ${desvColor(desv)}`}>
        {desv !== null ? fmt(desv) : "—"}
      </td>
      <td className={`px-2 py-2 text-right tabular-nums text-xs ${desvColor(desvPct)}`}>
        {fmtPct(desvPct)}
      </td>
    </tr>
  );
}

function TotalRow({
  label,
  row,
  style = "total",
}: {
  label: string;
  row: PlSummaryRow;
  style?: "total" | "margen" | "ebitda" | "recharge" | "ebitdapost";
}): React.JSX.Element {
  const desv = row.budget !== null ? row.total - row.budget : null;
  const desvPct = desv !== null && row.budget ? desv / row.budget : null;

  const bgClass =
    style === "margen"     ? "bg-blue-50"    :
    style === "ebitda"     ? "bg-indigo-50"  :
    style === "ebitdapost" ? "bg-indigo-100" :
    style === "recharge"   ? "bg-gray-50"    :
                             "bg-gray-50";

  const textClass =
    style === "ebitda" || style === "ebitdapost"
      ? row.total >= 0 ? "text-indigo-700" : "text-red-600"
      : "text-gray-900";

  return (
    <tr className={`${bgClass} border-y border-gray-100`}>
      <td className={`px-4 py-2.5 text-sm font-semibold ${bgClass} sticky left-0 border-r border-gray-100`}>
        {label}
      </td>
      {row.months.map((v, i) => (
        <td key={i} className={`px-2 py-2.5 text-right tabular-nums text-sm font-semibold ${textClass}`}>
          {fmt(v)}
        </td>
      ))}
      <td className={`px-2 py-2.5 text-right tabular-nums text-sm font-bold ${textClass} border-l border-gray-200`}>
        {fmt(row.total)}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-sm text-gray-400 font-medium">
        {row.budget !== null ? fmt(row.budget) : "—"}
      </td>
      <td className={`px-2 py-2.5 text-right tabular-nums text-sm font-medium ${desvColor(desv)}`}>
        {desv !== null ? fmt(desv) : "—"}
      </td>
      <td className={`px-2 py-2.5 text-right tabular-nums text-sm font-medium ${desvColor(desvPct)}`}>
        {fmtPct(desvPct)}
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PptoRealView({ data }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("LaTroupe");
  const d = data[tab];

  const showIngresos = tab !== "Awesomely";
  const showCogs     = tab !== "Awesomely";
  const showRecharge = tab !== "Consolidado";

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(["LaTroupe", "Gigson", "Awesomely", "Consolidado"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400">
        Base imponible neto (sin IVA) · € · REAL = clasificación ERP ene–jun 2026 · Ppto H1 = presupuesto 2026 hardcoded
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm min-w-[960px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 w-48 sticky left-0 bg-gray-50 z-10">
                Concepto
              </th>
              {MONTH_LABELS.map((l) => (
                <th key={l} className="px-2 py-2.5 text-right text-xs font-medium text-gray-500 w-16">
                  {l}
                </th>
              ))}
              <th className="px-2 py-2.5 text-right text-xs font-semibold text-gray-700 bg-blue-50 border-l border-gray-200 w-20">
                Total Real
              </th>
              <th className="px-2 py-2.5 text-right text-xs font-medium text-gray-400 w-20">
                Ppto H1
              </th>
              <th className="px-2 py-2.5 text-right text-xs font-medium text-gray-500 w-16">
                Desv €
              </th>
              <th className="px-2 py-2.5 text-right text-xs font-medium text-gray-500 w-14">
                Desv %
              </th>
            </tr>
          </thead>
          <tbody>
            {/* INGRESOS */}
            {showIngresos && (
              <>
                <SectionHeader label="01 Ingresos" />
                {d.ingresosRows.map((r) => (
                  <ProjectRow key={r.projectKey} row={r} />
                ))}

                <TotalRow label="TOTAL INGRESOS" row={d.totalIngresos} style="total" />
              </>
            )}

            {/* COGS */}
            {showCogs && (
              <>
                <SectionHeader label="02 COGS (por proyecto)" />
                {d.cogsRows.map((r) => (
                  <ProjectRow key={r.projectKey} row={r} />
                ))}
                <TotalRow label="TOTAL COGS" row={d.totalCogs} style="total" />
              </>
            )}

            {/* MARGEN BRUTO */}
            {showIngresos && (
              <TotalRow label="MARGEN BRUTO" row={d.margenBruto} style="margen" />
            )}

            {/* OPEX / ESTRUCTURA */}
            <>
              <SectionHeader label={tab === "Awesomely" ? "04/05 Estructura (OPEX)" : "05 OPEX (estructura directa)"} />
              {tab === "Awesomely" ? (
                d.awOpexRows.map((r) => <CategoryRow key={r.category} row={r} />)
              ) : (
                d.opexDirecto.total > 0.5 ? (
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-600 text-xs pl-7 sticky left-0 bg-white border-r border-gray-100">
                      OPEX directo
                    </td>
                    {d.opexDirecto.months.map((v, i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums text-xs text-gray-700">
                        {fmt(v)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right tabular-nums text-xs font-semibold text-gray-900 bg-gray-50/60">
                      {fmt(d.opexDirecto.total)}
                    </td>
                    <td colSpan={3} />
                  </tr>
                ) : (
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-300 pl-7 sticky left-0 bg-white border-r border-gray-100" colSpan={11}>
                      Sin OPEX directo clasificado
                    </td>
                  </tr>
                )
              )}
              <TotalRow
                label={tab === "Awesomely" ? "TOTAL ESTRUCTURA AW" : "TOTAL OPEX"}
                row={d.opexDirecto}
                style="total"
              />
            </>

            {/* EBITDA PRE-RECHARGE */}
            <TotalRow
              label={showRecharge ? "EBITDA (antes recharge AW)" : "EBITDA GRUPO"}
              row={d.ebitdaPreRecharge}
              style={showRecharge ? "ebitda" : "ebitdapost"}
            />

            {/* RECHARGE */}
            {showRecharge && (
              <>
                <tr className="border-b border-gray-50 bg-gray-50/40">
                  <td className="px-4 py-2 text-xs text-gray-500 pl-6 sticky left-0 bg-gray-50/40 border-r border-gray-100">
                    {tab === "Awesomely"
                      ? "(−) Recargado a marcas (LT 70% + GS 30%)"
                      : tab === "LaTroupe"
                      ? "(−) Recharge estructura AW (70%)"
                      : "(−) Recharge estructura AW (30%)"}
                  </td>
                  {d.rechargeAW.months.map((v, i) => (
                    <td key={i} className="px-2 py-2 text-right tabular-nums text-xs text-gray-500">
                      {fmt(v)}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums text-xs font-semibold text-gray-700 border-l border-gray-200">
                    {fmt(d.rechargeAW.total)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-xs text-gray-400">
                    {d.rechargeAW.budget !== null ? fmt(d.rechargeAW.budget) : "—"}
                  </td>
                  <td colSpan={2} />
                </tr>
                <TotalRow
                  label="EBITDA (post-recharge AW)"
                  row={d.ebitdaPostRecharge}
                  style="ebitdapost"
                />
              </>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Recharge AW: LaTroupe 70% / Gigson Solutions 30% (intercompañía, neutro en Consolidado).
        {" "}Personal AW incluye nómina Diego (no en Holded, imputada manualmente).
      </p>
    </div>
  );
}
