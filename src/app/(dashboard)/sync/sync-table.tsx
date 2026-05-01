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

const PAGE_SIZE = 25;

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }): React.JSX.Element {
  if (!active) return <ChevronsUpDown className="inline h-3.5 w-3.5 text-gray-300 ml-1" />;
  return dir === "asc"
    ? <ChevronUp className="inline h-3.5 w-3.5 text-indigo-600 ml-1" />
    : <ChevronDown className="inline h-3.5 w-3.5 text-indigo-600 ml-1" />;
}

function syncThAlignClass(align: "left" | "right"): string {
  return align === "right" ? "text-right" : "text-left";
}

function SyncSortTh({
  label,
  col,
  align = "left",
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  align?: "left" | "right";
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}): React.JSX.Element {
  return (
    <th
      className={`px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900 ${syncThAlignClass(align)}`}
      onClick={() => onSort(col)}
    >
      {label}
      <SortIcon active={sortKey === col} dir={sortDir} />
    </th>
  );
}

export function SyncTable({ rows }: { rows: SyncLogRow[] }): React.JSX.Element {
  const [sourceFilter, setSourceFilter] = useState<"" | SyncSource>("");
  const [resultFilter, setResultFilter] = useState<"" | SyncResult>("");
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);

  function handleSort(key: SortKey): void {
    setCurrentPage(1);
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);

  function goTo(p: number): void {
    setCurrentPage(Math.max(1, Math.min(p, totalPages)));
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value as "" | SyncSource); setCurrentPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 bg-white"
        >
          <option value="">Todas las fuentes</option>
          <option value="HOLDED">Holded</option>
          <option value="JIRA">Jira</option>
        </select>
        <select
          value={resultFilter}
          onChange={(e) => { setResultFilter(e.target.value as "" | SyncResult); setCurrentPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 bg-white"
        >
          <option value="">Todos los resultados</option>
          <option value="SUCCESS">OK</option>
          <option value="PARTIAL">Parcial</option>
          <option value="ERROR">Error</option>
        </select>
        {(sourceFilter || resultFilter) && (
          <button
            onClick={() => { setSourceFilter(""); setResultFilter(""); setCurrentPage(1); }}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50"
          >
            Limpiar
          </button>
        )}
        <span className="ml-auto text-sm text-gray-400 self-center">
          {filtered.length === 0 ? "0" : `${rangeStart}–${rangeEnd}`} de {filtered.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <SyncSortTh label="Fecha" col="startedAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SyncSortTh label="Fuente" col="source" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SyncSortTh label="Entidad" col="entityName" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th
                className="px-4 py-3 text-right font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900"
                onClick={() => handleSort("records")}
              >
                Registros
                <SortIcon active={sortKey === "records"} dir={sortDir} />
              </th>
              <SyncSortTh label="Resultado" col="result" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left font-medium text-gray-600">Error</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((row) => (
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => goTo(1)}
            disabled={safePage === 1}
            className="rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:border-gray-200 disabled:text-gray-300 disabled:pointer-events-none border-gray-300 hover:bg-gray-50"
          >
            «
          </button>
          <button
            onClick={() => goTo(safePage - 1)}
            disabled={safePage === 1}
            className="rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:border-gray-200 disabled:text-gray-300 disabled:pointer-events-none border-gray-300 hover:bg-gray-50"
          >
            Anterior
          </button>

          {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) {
              p = i + 1;
            } else if (safePage <= 4) {
              p = i + 1;
            } else if (safePage >= totalPages - 3) {
              p = totalPages - 6 + i;
            } else {
              p = safePage - 3 + i;
            }
            return (
              <button
                key={p}
                onClick={() => goTo(p)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  p === safePage
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                {p}
              </button>
            );
          })}

          <button
            onClick={() => goTo(safePage + 1)}
            disabled={safePage === totalPages}
            className="rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:border-gray-200 disabled:text-gray-300 disabled:pointer-events-none border-gray-300 hover:bg-gray-50"
          >
            Siguiente
          </button>
          <button
            onClick={() => goTo(totalPages)}
            disabled={safePage === totalPages}
            className="rounded-lg border px-3 py-1.5 text-sm transition-colors disabled:border-gray-200 disabled:text-gray-300 disabled:pointer-events-none border-gray-300 hover:bg-gray-50"
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}
