"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { LocalDateTime } from "@/components/local-datetime";
import { ChevronUp, ChevronDown, ChevronsUpDown, X, Search } from "lucide-react";

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
  triggeredBy: string | null;
}

type UpsertError = { type: string; holdedId: string; docNumber: string; error: string };
type SyncLogDetails = {
  fetchedIds: string[];
  upsertErrors: UpsertError[];
} | null;

type SyncLogDetail = {
  id: string;
  source: string;
  entityName: string;
  result: string;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  details: SyncLogDetails;
};

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

// ─── Modal ──────────────────────────────────────────────────────────────────

type SearchState =
  | { status: "idle" }
  | { status: "found_ok"; holdedId: string }
  | { status: "found_error"; holdedId: string; error: UpsertError }
  | { status: "not_fetched"; holdedId: string };

function SyncLogModal({
  logId,
  onClose,
}: {
  logId: string;
  onClose: () => void;
}): React.JSX.Element {
  const [log, setLog] = useState<SyncLogDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sync-logs/${logId}`)
      .then((r) => r.json())
      .then((data: SyncLogDetail) => { setLog(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [logId]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [loading]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const searchResult = useMemo((): SearchState => {
    const trimmed = query.trim();
    if (!trimmed || !log?.details) return { status: "idle" };

    const { fetchedIds, upsertErrors } = log.details;
    if (!fetchedIds.includes(trimmed)) return { status: "not_fetched", holdedId: trimmed };

    const err = upsertErrors.find((e) => e.holdedId === trimmed);
    if (err) return { status: "found_error", holdedId: trimmed, error: err };
    return { status: "found_ok", holdedId: trimmed };
  }, [query, log]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Detalle del sync</h2>
            {log && (
              <p className="text-xs text-gray-500 mt-0.5">
                {log.entityName} · <LocalDateTime date={log.startedAt} />
                {log.details && (
                  <span className="ml-2 text-gray-400">
                    {log.details.fetchedIds.length} docs de Holded
                    {log.details.upsertErrors.length > 0 && (
                      <span className="text-red-500 ml-1">
                        · {log.details.upsertErrors.length} error{log.details.upsertErrors.length !== 1 ? "es" : ""}
                      </span>
                    )}
                  </span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-4 mt-0.5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
          {loading && (
            <p className="text-sm text-gray-400 text-center py-8">Cargando…</p>
          )}

          {!loading && log?.source !== "HOLDED" && (
            <p className="text-sm text-gray-500 text-center py-8">
              El detalle de documentos solo está disponible para syncs de Holded.
            </p>
          )}

          {!loading && log?.source === "HOLDED" && !log.details && (
            <p className="text-sm text-gray-500 text-center py-8">
              Este sync no tiene datos detallados.
              <br />
              <span className="text-gray-400 text-xs">
                Solo los syncs posteriores al deploy tendrán información de documentos.
              </span>
            </p>
          )}

          {!loading && log?.source === "HOLDED" && log.details && (
            <>
              {/* Search */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Buscar por Holded ID
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Pega un holdedId…"
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                  />
                </div>

                {/* Result */}
                {searchResult.status !== "idle" && (
                  <div className={`mt-2 rounded-lg px-3 py-2.5 text-sm ${
                    searchResult.status === "found_ok"
                      ? "bg-green-50 text-green-800"
                      : searchResult.status === "found_error"
                      ? "bg-red-50 text-red-800"
                      : "bg-amber-50 text-amber-800"
                  }`}>
                    {searchResult.status === "found_ok" && (
                      <p>✅ <strong>Llegó y se guardó correctamente</strong></p>
                    )}
                    {searchResult.status === "found_error" && (
                      <>
                        <p>❌ <strong>Llegó de Holded pero falló al guardarse</strong></p>
                        <p className="mt-1 text-xs opacity-80">
                          {searchResult.error.type}
                          {searchResult.error.docNumber ? ` · doc ${searchResult.error.docNumber}` : ""}
                          {" · "}{searchResult.error.error}
                        </p>
                      </>
                    )}
                    {searchResult.status === "not_fetched" && (
                      <>
                        <p>⚠️ <strong>No llegó de Holded en este sync</strong></p>
                        <p className="mt-1 text-xs opacity-80">
                          El documento existe en Holded pero no fue retornado por el listado paginado.
                          Puede ser un borrador, un documento con fecha fuera de ventana, o un problema de la API de Holded.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Upsert errors list */}
              {log.details.upsertErrors.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-2">
                    Errores de importación ({log.details.upsertErrors.length})
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {log.details.upsertErrors.map((err, i) => (
                      <div key={i} className="bg-red-50 rounded-lg px-3 py-2 text-xs">
                        <p className="font-mono text-red-700 truncate">{err.holdedId}</p>
                        <p className="text-red-600 mt-0.5">
                          {err.type}{err.docNumber ? ` · ${err.docNumber}` : ""}
                        </p>
                        <p className="text-red-500 mt-0.5 line-clamp-2">{err.error}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Table ───────────────────────────────────────────────────────────────────

export function SyncTable({ rows }: { rows: SyncLogRow[] }): React.JSX.Element {
  const [sourceFilter, setSourceFilter] = useState<"" | SyncSource>("");
  const [resultFilter, setResultFilter] = useState<"" | SyncResult>("");
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

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
    <>
      {selectedLogId && (
        <SyncLogModal logId={selectedLogId} onClose={() => setSelectedLogId(null)} />
      )}

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
                <th className="px-4 py-3 text-left font-medium text-gray-600">Usuario</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Error</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedLogId(row.id)}
                  className="border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 transition-colors"
                >
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
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    {row.triggeredBy === "cron"
                      ? <span className="italic text-gray-400">cron</span>
                      : (row.triggeredBy ?? <span className="text-gray-300">—</span>)}
                  </td>
                  <td className="px-4 py-3 text-red-600 text-xs max-w-xs" title={row.errorMessage ?? ""}>
                    <span className="line-clamp-2">{row.errorMessage ?? ""}</span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
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
    </>
  );
}
