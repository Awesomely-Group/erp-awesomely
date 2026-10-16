"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClickableRow } from "@/components/clickable-row";
import { SortThClick } from "@/components/sort-th";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { CampaignRow } from "@/lib/kpis/types";
import { CAMPAIGN_STATUS_LABEL } from "./campanas-labels";

type SortKey = keyof Pick<
  CampaignRow,
  "name" | "status" | "lineOfBusiness" | "dailyBudgetEur" | "costEur" | "impressions" | "clicks" | "ctrPct" | "cpcEur" | "conversionsAds" | "leadsCrm" | "cplCrmEur" | "cplQualifiedEur" | "lostIsBudgetPct"
>;
type SortDir = "asc" | "desc";

const STATUS_CLASS: Record<string, string> = {
  ENABLED: "bg-emerald-100 text-emerald-700",
  PAUSED: "bg-amber-100 text-amber-700",
  REMOVED: "bg-gray-100 text-gray-500",
  UNKNOWN: "bg-gray-100 text-gray-500",
};

const money = (v: number | null): string => (v === null ? "—" : formatCurrency(v));
const pct = (v: number | null): string => (v === null ? "—" : formatPercent(v));

function compare(a: CampaignRow, b: CampaignRow, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  // null al final en los dos sentidos: "sin dato" no es ni el mayor ni el menor.
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  const cmp = typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv, "es") : Number(av) - Number(bv);
  return dir === "asc" ? cmp : -cmp;
}

export function CampanasTable({ rows }: { rows: CampaignRow[] }): React.JSX.Element {
  const sp = useSearchParams();
  const [sortKey, setSortKey] = useState<SortKey>("costEur");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggle(key: SortKey): void {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "name" || key === "status" || key === "lineOfBusiness" ? "asc" : "desc");
    }
  }

  const sorted = [...rows].sort((a, b) => compare(a, b, sortKey, sortDir));
  const qs = sp.toString();
  const th = (label: string, key: SortKey, align: "left" | "right" = "right"): React.JSX.Element => (
    <SortThClick label={label} active={sortKey === key} sortDir={sortDir} onClick={() => toggle(key)} align={align} />
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center text-sm text-gray-500">
        Todavía no ha llegado ninguna campaña. Cuando el Google Ads Script haga su primer volcado aparecerán aquí
        (ver <code className="rounded bg-white px-1">scripts/google-ads/README.md</code>).
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide">
          <tr>
            {th("Campaña", "name", "left")}
            {th("Estado", "status", "left")}
            {th("Línea", "lineOfBusiness", "left")}
            {th("Presup./día", "dailyBudgetEur")}
            {th("Gasto", "costEur")}
            {th("Impr.", "impressions")}
            {th("Clics", "clicks")}
            {th("CTR", "ctrPct")}
            {th("CPC", "cpcEur")}
            {th("Conv. Ads", "conversionsAds")}
            {th("Leads CRM", "leadsCrm")}
            {th("CPL", "cplCrmEur")}
            {th("CPL cual.", "cplQualifiedEur")}
            {th("IS perdida (presup.)", "lostIsBudgetPct")}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((r) => (
            <ClickableRow key={r.campaignId} href={`/campanas/${r.campaignId}${qs ? `?${qs}` : ""}`} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{r.name}</p>
                <p className="text-xs text-gray-400">
                  {r.marca ?? "sin marca"}
                  {!r.isMapped && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">sin mapear</span>}
                </p>
              </td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASS[r.status] ?? STATUS_CLASS.UNKNOWN}`}>
                  {CAMPAIGN_STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">{r.lineOfBusiness ?? "—"}</td>
              <td className="px-4 py-3 text-right text-gray-600">{money(r.dailyBudgetEur)}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(r.costEur)}</td>
              <td className="px-4 py-3 text-right text-gray-600">{formatNumber(r.impressions)}</td>
              <td className="px-4 py-3 text-right text-gray-600">{formatNumber(r.clicks)}</td>
              <td className="px-4 py-3 text-right text-gray-600">{pct(r.ctrPct)}</td>
              <td className="px-4 py-3 text-right text-gray-600">{money(r.cpcEur)}</td>
              <td className="px-4 py-3 text-right text-gray-600">{formatNumber(r.conversionsAds, { decimals: 1 })}</td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">{r.leadsCrm}</td>
              <td className="px-4 py-3 text-right text-gray-600">{money(r.cplCrmEur)}</td>
              <td className="px-4 py-3 text-right text-gray-600">{money(r.cplQualifiedEur)}</td>
              <td className="px-4 py-3 text-right text-gray-600">{pct(r.lostIsBudgetPct)}</td>
            </ClickableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
