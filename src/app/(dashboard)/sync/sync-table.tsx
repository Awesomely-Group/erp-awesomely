"use client";

import { useState, useMemo } from "react";
import { LocalDateTime } from "@/components/local-datetime";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SyncSource = "HOLDED" | "JIRA";
type SyncResult = "SUCCESS" | "PARTIAL" | "ERROR";

export interface SyncLogRow {
  id: string;
  startedAt: string;
  source: SyncSource;
  entityName: string;
  records: number;
  recordsLabel: string;
  result: SyncResult;
  errorMessage: string | null;
}

const RESULT_LABELS: Record<SyncResult, string> = {
  SUCCESS: "OK",
  PARTIAL: "Parcial",
  ERROR: "Error",
};

const RESULT_COLORS: Record<SyncResult, string> = {
  SUCCESS: "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  ERROR: "bg-red-100 text-red-700",
};

type SortKey = "startedAt" | "source" | "entityName" | "records" | "result";
type SortDir = "asc" | "desc";

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: SortDir }): React.JSX.Element {
  if (!active) return <ChevronsUpDown className="inline h-3.5 w-3.5 text-gray-300 ml-1" />;
  return dir === "asc"
    ? <ChevronUp className="inline h-3.5 w-3.5 text-indigo-600 ml-1" />
    : <ChevronDown className="inline h-3.5 w-3.5 text-indigo-600 ml-1" />;
}

export function SyncTable({ rows }: { rows: SyncLogRow[] }): React.JSX.Element {
  const [sourceFilter, setSourceFilter] = useState<"" | SyncSource>("");
  const [resultFilter, setResultFilter] = useState<"" | SyncResult>("");
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const filtered = useMemo(() => {
    let data = rows;
    if (sourceFilter) data = data.filter((r) => r.source === sourceFilter);
    if (resultFilter) data = data.filter((r) => r.result === resultFilter);
    return [...data].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "startedAt":
          cmp = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
          break;
        case "source":
          cmp = a.source.localeCompare(b.source);
          break;
        case "entityName":
          cmp = a.entityName.localeCompare(b.entityName);
          break;
        case "records":
          cmp = a.records - b.records;
          break;
        case "result":
          cmp = a.result.localeCompare(b.result);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sourceFilter, resultFilter, sortKey, sortDir]);

  function Th({ label, col, align = "left" }: { label: string; col: SortKey; align?: "left" | "right" }): React.JSX.Element {
    return (
      <th
        className={`px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 text-${align}`}
        onClick={() => handleSort(col)}
      >
        {label}
        <SortIcon col={col} active={sortKey === col} dir={sortDir} />
      </th>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as "" | SyncSource)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 bg-white"
        >
          <option value="">Todas las fuentes</option>
          <option value="HOLDED">Holded</option>
          <option value="JIRA">Jira</option>
        </select>
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value as "" | SyncResult)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 bg-white"
        >
          <option value="">Todos los resultados</option>
          <option value="SUCCESS">OK</option>
          <option value="PARTIAL">Parcial</option>
          <option value="ERROR">Error</option>
        </select>
        {(sourceFilter || resultFilter) && (
          <button
            onClick={() => { setSourceFilter(""); setResultFilter(""); }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-sm text-gray-400 self-center">
          {filtered.length} de {rows.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <Th label="Fecha" col="startedAt" />
              <Th label="Fuente" col="source" />
              <Th label="Entidad" col="entityName" />
              <th className="px-4 py-3 text-right font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900"
                  onClick={() => handleSort("records")}>
                Registros
                <SortIcon col="records" active={sortKey === "records"} dir={sortDir} />
              </th>
              <Th label="Resultado" col="result" />
              <th className="px-4 py-3 text-left font-medium text-gray-600">Error</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  <LocalDateTime date={row.startedAt} />
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {row.source === "HOLDED" ? "Holded" : "Jira"}
                </td>
                <td className="px-4 py-3 text-gray-900">{row.entityName}</td>
                <td className="px-4 py-3 text-right text-gray-600">{row.recordsLabel}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${RESULT_COLORS[row.result]}`}>
                    {RESULT_LABELS[row.result]}
                  </span>
                </td>
                <td className="px-4 py-3 text-red-600 text-xs max-w-xs" title={row.errorMessage ?? ""}>
                  <span className="line-clamp-2">{row.errorMessage ?? ""}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No hay sincronizaciones con estos filtros
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
