"use client";

import { useState, useTransition } from "react";
import { ForecastType } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { deleteForecast } from "./actions";
import { ForecastForm } from "./forecast-form";
import { Pencil, Trash2 } from "lucide-react";

type Project = { id: string; name: string };

type ForecastRow = {
  id: string;
  month: Date;
  type: ForecastType;
  marca: string | null;
  projectId: string | null;
  project: { id: string; name: string } | null;
  description: string | null;
  amountOptimistic: unknown;
  amountPessimistic: unknown;
};

type MonthGroup = {
  monthKey: string;
  monthLabel: string;
  rows: ForecastRow[];
};

function groupByMonth(forecasts: ForecastRow[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const f of forecasts) {
    const d = f.month;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
    if (!map.has(key)) map.set(key, { monthKey: key, monthLabel: label, rows: [] });
    map.get(key)!.rows.push(f);
  }
  return Array.from(map.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function DeleteButton({ id }: { id: string }): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => startTransition(() => deleteForecast(id))}
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
      title="Eliminar"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

export function ForecastsTable({
  forecasts,
  projects,
}: {
  forecasts: ForecastRow[];
  projects: Project[];
}): React.JSX.Element {
  const [editing, setEditing] = useState<ForecastRow | null>(null);
  const groups = groupByMonth(forecasts);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-sm text-gray-400 gap-2">
        <p>No hay previsiones todavía.</p>
        <p className="text-xs">Usa el botón "Nueva previsión" para añadir la primera.</p>
      </div>
    );
  }

  return (
    <>
      {editing && (
        <ForecastForm
          forecast={editing}
          projects={projects}
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Proyecto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600">Descripción</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Pesimista</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600">Optimista</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const incomeRows = group.rows.filter((r) => r.type === ForecastType.INCOME);
              const expenseRows = group.rows.filter((r) => r.type === ForecastType.EXPENSE);
              const totalPessimistic = group.rows.reduce((s, r) => s + Number(r.amountPessimistic), 0);
              const totalOptimistic = group.rows.reduce((s, r) => s + Number(r.amountOptimistic), 0);

              return (
                <>
                  <tr key={`${group.monthKey}-header`} className="bg-blue-50 border-b border-blue-100">
                    <td colSpan={5} className="px-4 py-2">
                      <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                        {group.monthLabel}
                      </span>
                      <span className="text-xs text-blue-500 ml-2">
                        {group.rows.length} previsión{group.rows.length !== 1 ? "es" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-blue-700">
                      {formatCurrency(totalPessimistic)}
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-blue-700">
                      {formatCurrency(totalOptimistic)}
                    </td>
                    <td />
                  </tr>
                  {[...incomeRows, ...expenseRows].map((f) => (
                    <tr
                      key={f.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-gray-500 text-xs">
                        {f.month.toLocaleDateString("es-ES", { month: "short", year: "numeric", timeZone: "UTC" })}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            f.type === ForecastType.INCOME
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {f.type === ForecastType.INCOME ? "Ingreso" : "Gasto"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">
                        {f.marca ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[140px] truncate">
                        {f.project?.name ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs max-w-[180px] truncate">
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
                          <button
                            type="button"
                            onClick={() => setEditing(f)}
                            className="text-gray-400 hover:text-indigo-600 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <DeleteButton id={f.id} />
                        </div>
                      </td>
                    </tr>
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
