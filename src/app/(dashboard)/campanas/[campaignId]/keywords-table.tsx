"use client";

import { useState } from "react";
import { SortThClick } from "@/components/sort-th";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { KeywordMatrixRow } from "@/lib/ads-matrices";

type SortKey = "keywordText" | "matchType" | "adGroupName" | "qualityScore" | "impressions" | "clicks" | "ctrPct" | "costEur" | "cpcEur" | "conversions" | "cplEur";
type SortDir = "asc" | "desc";

const MATCH_LABEL: Record<string, string> = { EXACT: "Exacta", PHRASE: "Frase", BROAD: "Amplia" };

const money = (v: number | null): string => (v === null ? "—" : formatCurrency(v));
const pct = (v: number | null): string => (v === null ? "—" : formatPercent(v));

function compare(a: KeywordMatrixRow, b: KeywordMatrixRow, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "es") : Number(av) - Number(bv);
  return dir === "asc" ? cmp : -cmp;
}

/** Matriz de keywords: qué palabras clave gastan más (orden por coste) y a qué CPL. */
export function KeywordsTable({ rows }: { rows: KeywordMatrixRow[] }): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>("costEur");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: SortKey): void {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "keywordText" || key === "matchType" || key === "adGroupName" ? "asc" : "desc");
    }
  }
  const th = (label: string, key: SortKey, align: "left" | "right" = "right"): React.JSX.Element => (
    <SortThClick label={label} active={sortKey === key} sortDir={sortDir} onClick={() => toggle(key)} align={align} />
  );

  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-400">Sin keywords con impresiones en este periodo.</p>;
  }

  const sorted = [...rows].sort((a, b) => compare(a, b, sortKey, sortDir));
  const total = rows.reduce(
    (acc, r) => ({ impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, costEur: acc.costEur + r.costEur, conversions: acc.conversions + r.conversions }),
    { impressions: 0, clicks: 0, costEur: 0, conversions: 0 },
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide">
          <tr>
            {th("Keyword", "keywordText", "left")}
            {th("Concordancia", "matchType", "left")}
            {th("Grupo", "adGroupName", "left")}
            {th("QS", "qualityScore")}
            {th("Impr.", "impressions")}
            {th("Clics", "clicks")}
            {th("CTR", "ctrPct")}
            {th("Coste", "costEur")}
            {th("CPC", "cpcEur")}
            {th("Conv.", "conversions")}
            {th("CPL", "cplEur")}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((r) => (
            <tr key={r.key} className="hover:bg-gray-50">
              <td className="px-4 py-2.5 font-medium text-gray-900">{r.keywordText}</td>
              <td className="px-4 py-2.5 text-gray-600">{MATCH_LABEL[r.matchType] ?? r.matchType}</td>
              <td className="px-4 py-2.5 text-gray-500">{r.adGroupName}</td>
              <td className="px-4 py-2.5 text-right">
                {r.qualityScore === null ? (
                  <span className="text-gray-300">—</span>
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      r.qualityScore >= 7 ? "bg-emerald-100 text-emerald-700" : r.qualityScore >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {r.qualityScore}/10
                  </span>
                )}
              </td>
              <td className="px-4 py-2.5 text-right text-gray-600">{formatNumber(r.impressions)}</td>
              <td className="px-4 py-2.5 text-right text-gray-600">{formatNumber(r.clicks)}</td>
              <td className="px-4 py-2.5 text-right text-gray-600">{pct(r.ctrPct)}</td>
              <td className="px-4 py-2.5 text-right font-medium text-gray-900">{formatCurrency(r.costEur)}</td>
              <td className="px-4 py-2.5 text-right text-gray-600">{money(r.cpcEur)}</td>
              <td className="px-4 py-2.5 text-right text-gray-600">{formatNumber(r.conversions, { decimals: 1 })}</td>
              <td className="px-4 py-2.5 text-right text-gray-600">{money(r.cplEur)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 bg-gray-50 text-xs font-medium text-gray-700">
          <tr>
            <td className="px-4 py-2.5" colSpan={4}>
              Total · {rows.length} keywords
            </td>
            <td className="px-4 py-2.5 text-right">{formatNumber(total.impressions)}</td>
            <td className="px-4 py-2.5 text-right">{formatNumber(total.clicks)}</td>
            <td className="px-4 py-2.5 text-right">{total.impressions > 0 ? formatPercent((total.clicks / total.impressions) * 100) : "—"}</td>
            <td className="px-4 py-2.5 text-right">{formatCurrency(total.costEur)}</td>
            <td className="px-4 py-2.5 text-right">{total.clicks > 0 ? formatCurrency(total.costEur / total.clicks) : "—"}</td>
            <td className="px-4 py-2.5 text-right">{formatNumber(total.conversions, { decimals: 1 })}</td>
            <td className="px-4 py-2.5 text-right">{total.conversions > 0 ? formatCurrency(total.costEur / total.conversions) : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
