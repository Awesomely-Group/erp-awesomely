"use client";

import { useState, useTransition } from "react";
import { ForecastFrequency, ForecastType } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { deleteForecast, setForecastPaused } from "./actions";
import { deleteForecastRecurrence } from "./recurrence-actions";
import { ForecastForm } from "./forecast-form";
import { Pencil, Trash2, ChevronDown, ChevronRight, PauseCircle, PlayCircle } from "lucide-react";
import type { AccountMappingOption, SupplierOption } from "./forecast-classification-fields";

type Project = { id: string; name: string };

type ForecastRow = {
  id: string;
  month: Date;
  type: ForecastType;
  marca: string | null;
  projectId: string | null;
  project: { id: string; name: string } | null;
  accountMappingId: string | null;
  accountMapping: { id: string; description: string; l1: string } | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  description: string | null;
  amountOptimistic: unknown;
  amountPessimistic: unknown;
  recurrenceId: string | null;
  recurrence?: { id: string; frequency: ForecastFrequency } | null;
  isPaused: boolean;
};

type RecurrenceGroup = {
  kind: "recurrence";
  key: string;
  recurrenceId: string;
  frequency: ForecastFrequency | null;
  sortDate: Date;
  rows: ForecastRow[];
};

type StandaloneEntry = {
  kind: "standalone";
  key: string;
  sortDate: Date;
  row: ForecastRow;
};

type TableEntry = RecurrenceGroup | StandaloneEntry;

const FREQUENCY_LABELS: Record<ForecastFrequency, string> = {
  DAILY: "Diaria",
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
  YEARLY: "Anual",
};

function groupForecasts(forecasts: ForecastRow[]): TableEntry[] {
  const recurrenceMap = new Map<string, ForecastRow[]>();
  const entries: TableEntry[] = [];

  for (const f of forecasts) {
    if (f.recurrenceId) {
      const list = recurrenceMap.get(f.recurrenceId) ?? [];
      list.push(f);
      recurrenceMap.set(f.recurrenceId, list);
    } else {
      entries.push({ kind: "standalone", key: f.id, sortDate: f.month, row: f });
    }
  }

  for (const [recurrenceId, rows] of recurrenceMap) {
    rows.sort((a, b) => a.month.getTime() - b.month.getTime());
    entries.push({
      kind: "recurrence",
      key: recurrenceId,
      recurrenceId,
      frequency: rows[0]?.recurrence?.frequency ?? null,
      sortDate: rows[0].month,
      rows,
    });
  }

  return entries.sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime());
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("es-ES", { month: "short", year: "numeric", timeZone: "UTC" });
}

function DeleteButton({ onConfirm, title }: { onConfirm: () => void; title: string }): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => startTransition(onConfirm)}
          disabled={pending}
          className="text-xs text-red-600 hover:text-red-800 font-medium"
        >
          {pending ? "…" : "Confirmar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="text-gray-400 hover:text-red-500 transition-colors"
      title={title}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function PauseButton({ id, isPaused }: { id: string; isPaused: boolean }): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => setForecastPaused(id, !isPaused))}
      disabled={pending}
      className="text-gray-400 hover:text-amber-500 transition-colors"
      title={isPaused ? "Reactivar" : "Pausar"}
    >
      {isPaused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
    </button>
  );
}

function ForecastDataRow({
  f,
  onEdit,
}: {
  f: ForecastRow;
  onEdit: (f: ForecastRow) => void;
}): React.JSX.Element {
  return (
    <tr
      className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${
        f.isPaused ? "opacity-50" : ""
      }`}
    >
      <td className="px-4 py-2.5 text-gray-500 text-xs">{monthLabel(f.month)}</td>
      <td className="px-4 py-2.5">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            f.type === ForecastType.INCOME ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {f.type === ForecastType.INCOME ? "Ingreso" : "Gasto"}
        </span>
        {f.isPaused && (
          <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Pausado
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 text-gray-600 text-xs">{f.marca ?? <span className="text-gray-400">—</span>}</td>
      <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[140px] truncate">
        {f.accountMapping?.description ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[120px] truncate">
        {f.supplier?.name ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[140px] truncate">
        {f.description ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right font-medium text-sm text-blue-700">
        {formatCurrency(Number(f.amountPessimistic))}
      </td>
      <td className="px-4 py-2.5 text-right font-medium text-sm text-blue-700">
        {formatCurrency(Number(f.amountOptimistic))}
      </td>
      <td className="px-4 py-2.5 text-center">
        <div className="flex items-center justify-center gap-2">
          <PauseButton id={f.id} isPaused={f.isPaused} />
          <button
            type="button"
            onClick={() => onEdit(f)}
            className="text-gray-400 hover:text-indigo-600 transition-colors"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <DeleteButton onConfirm={() => deleteForecast(f.id)} title="Eliminar" />
        </div>
      </td>
    </tr>
  );
}

export function ForecastsTable({
  forecasts,
  projects,
  accountMappings,
  suppliers,
}: {
  forecasts: ForecastRow[];
  projects: Project[];
  accountMappings: AccountMappingOption[];
  suppliers: SupplierOption[];
}): React.JSX.Element {
  const [editing, setEditing] = useState<ForecastRow | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const entries = groupForecasts(forecasts);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-sm text-gray-400 gap-2">
        <p>No hay previsiones todavía.</p>
        <p className="text-xs">Usa el botón &quot;Nueva previsión&quot; para añadir la primera.</p>
      </div>
    );
  }

  return (
    <>
      {editing && (
        <ForecastForm
          forecast={editing}
          projects={projects}
          accountMappings={accountMappings}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Mes</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Marca</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Cuenta</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Proveedor</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Descripción</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Pesimista</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Optimista</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              if (entry.kind === "standalone") {
                return <ForecastDataRow key={entry.key} f={entry.row} onEdit={setEditing} />;
              }

              const isOpen = expanded[entry.key] ?? false;
              const activeRows = entry.rows.filter((r) => !r.isPaused);
              const totalPessimistic = activeRows.reduce((s, r) => s + Number(r.amountPessimistic), 0);
              const totalOptimistic = activeRows.reduce((s, r) => s + Number(r.amountOptimistic), 0);
              const firstLabel = monthLabel(entry.rows[0].month);
              const lastLabel = monthLabel(entry.rows[entry.rows.length - 1].month);

              return (
                <>
                  <tr key={`${entry.key}-header`} className="bg-indigo-50 border-b border-indigo-100">
                    <td colSpan={5} className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => ({ ...prev, [entry.key]: !isOpen }))}
                        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 uppercase tracking-wide"
                      >
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        {entry.frequency ? FREQUENCY_LABELS[entry.frequency] : "Recurrencia"}
                        <span className="text-indigo-400 font-normal">
                          · {firstLabel}
                          {entry.rows.length > 1 ? ` – ${lastLabel}` : ""}
                        </span>
                      </button>
                      <span className="text-xs text-indigo-500 ml-2">
                        {entry.rows.length} previsión{entry.rows.length !== 1 ? "es" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-indigo-700">
                      {formatCurrency(totalPessimistic)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-indigo-700">
                      {formatCurrency(totalOptimistic)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <DeleteButton
                        onConfirm={() => deleteForecastRecurrence(entry.recurrenceId)}
                        title="Eliminar recurrencia (borra todos los hijos)"
                      />
                    </td>
                  </tr>
                  {isOpen &&
                    entry.rows.map((f) => (
                      <ForecastDataRow key={f.id} f={f} onEdit={setEditing} />
                    ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
