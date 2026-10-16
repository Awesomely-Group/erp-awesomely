"use client";

import { useState } from "react";
import { SortThClick } from "@/components/sort-th";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { NEGATIVE_CANDIDATE_MIN_CLICKS, type SearchTermMatrixRow } from "@/lib/ads-matrices";

type SortKey = "searchTerm" | "matchType" | "adGroupName" | "status" | "impressions" | "clicks" | "ctrPct" | "costEur" | "cpcEur" | "conversions";
type SortDir = "asc" | "desc";

const MATCH_LABEL: Record<string, string> = {
  EXACT: "Exacta",
  NEAR_EXACT: "≈ Exacta",
  PHRASE: "Frase",
  NEAR_PHRASE: "≈ Frase",
  BROAD: "Amplia",
};
const STATUS_LABEL: Record<string, string> = {
  ADDED: "Añadida",
  EXCLUDED: "Excluida",
  ADDED_EXCLUDED: "Añadida y excluida",
  NONE: "—",
};

const money = (v: number | null): string => (v === null ? "—" : formatCurrency(v));
const pct = (v: number | null): string => (v === null ? "—" : formatPercent(v));

function compare(a: SearchTermMatrixRow, b: SearchTermMatrixRow, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "es") : Number(av) - Number(bv);
  return dir === "asc" ? cmp : -cmp;
}

/**
 * Matriz de términos de búsqueda: lo que escribió el usuario para que saltara el anuncio
 * y cuánto costó. Los que gastan clics sin convertir salen en ámbar como "candidato a
 * negativa" — texto, sin acción: excluir se hace en Google Ads.
 */
export function SearchTermsTable({ rows }: { rows: SearchTermMatrixRow[] }): React.JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>("costEur");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [onlyCandidates, setOnlyCandidates] = useState(false);

  function toggle(key: SortKey): void {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "searchTerm" || key === "matchType" || key === "adGroupName" || key === "status" ? "asc" : "desc");
    }
  }
  const th = (label: string, key: SortKey, align: "left" | "right" = "right"): React.JSX.Element => (
    <SortThClick label={label} active={sortKey === key} sortDir={sortDir} onClick={() => toggle(key)} align={align} />
  );

  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-gray-400">Sin términos de búsqueda en este periodo.</p>;
  }

  const candidates = rows.filter((r) => r.isNegativeCandidate).length;
  const visible = (onlyCandidates ? rows.filter((r) => r.isNegativeCandidate) : rows).slice().sort((a, b) => compare(a, b, sortKey, sortDir));

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 text-xs text-gray-500">
        <span>
          {rows.length} términos · {candidates} candidato{candidates === 1 ? "" : "s"} a negativa (≥ {NEGATIVE_CANDIDATE_MIN_CLICKS} clics sin
          conversión)
        </span>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={onlyCandidates} onChange={(e) => setOnlyCandidates(e.target.checked)} className="rounded border-gray-300" />
          Solo candidatos
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide">
            <tr>
              {th("Término de búsqueda", "searchTerm", "left")}
              {th("Casó por", "matchType", "left")}
              {th("Grupo", "adGroupName", "left")}
              {th("Estado", "status", "left")}
              {th("Impr.", "impressions")}
              {th("Clics", "clicks")}
              {th("CTR", "ctrPct")}
              {th("Coste", "costEur")}
              {th("CPC", "cpcEur")}
              {th("Conv.", "conversions")}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map((r) => (
              <tr key={r.key} className={r.isNegativeCandidate ? "bg-amber-50/60 hover:bg-amber-50" : "hover:bg-gray-50"}>
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  {r.searchTerm}
                  {r.isNegativeCandidate && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">candidato a negativa</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{MATCH_LABEL[r.matchType] ?? r.matchType}</td>
                <td className="px-4 py-2.5 text-gray-500">{r.adGroupName}</td>
                <td className="px-4 py-2.5 text-gray-600">{r.status ? (STATUS_LABEL[r.status] ?? r.status) : "—"}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{formatNumber(r.impressions)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{formatNumber(r.clicks)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{pct(r.ctrPct)}</td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900">{formatCurrency(r.costEur)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{money(r.cpcEur)}</td>
                <td className="px-4 py-2.5 text-right text-gray-600">{formatNumber(r.conversions, { decimals: 1 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
