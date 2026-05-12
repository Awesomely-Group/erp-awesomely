"use client";

import { useTransition, useState } from "react";
import { ForecastType } from "@prisma/client";
import { MARCA_OPTIONS } from "@/lib/org";
import { createForecast, updateForecast } from "./actions";

type Project = { id: string; name: string };

type ForecastRow = {
  id: string;
  month: Date;
  type: ForecastType;
  marca: string | null;
  projectId: string | null;
  description: string | null;
  amountOptimistic: unknown;
  amountPessimistic: unknown;
};

function toMonthValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function ForecastForm({
  forecast,
  projects,
  onClose,
}: {
  forecast?: ForecastRow;
  projects: Project[];
  onClose: () => void;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const month = fd.get("month") as string;
    const type = fd.get("type") as ForecastType;
    const marca = (fd.get("marca") as string) || null;
    const projectId = (fd.get("projectId") as string) || null;
    const description = (fd.get("description") as string) || null;
    const amountOptimistic = parseFloat(fd.get("amountOptimistic") as string);
    const amountPessimistic = parseFloat(fd.get("amountPessimistic") as string);

    if (!month || isNaN(amountOptimistic) || isNaN(amountPessimistic)) {
      setError("Por favor rellena todos los campos obligatorios.");
      return;
    }

    setError(null);
    startTransition(async () => {
      if (forecast) {
        await updateForecast(forecast.id, { month, type, marca, projectId, description, amountOptimistic, amountPessimistic });
      } else {
        await createForecast({ month, type, marca, projectId, description, amountOptimistic, amountPessimistic });
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            {forecast ? "Editar previsión" : "Nueva previsión"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Mes *</label>
              <input
                type="month"
                name="month"
                required
                defaultValue={forecast ? toMonthValue(forecast.month) : defaultMonth}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Tipo *</label>
              <select
                name="type"
                required
                defaultValue={forecast?.type ?? ForecastType.INCOME}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value={ForecastType.INCOME}>Ingreso</option>
                <option value={ForecastType.EXPENSE}>Gasto</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Marca</label>
              <select
                name="marca"
                defaultValue={forecast?.marca ?? ""}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">Sin asignar</option>
                {MARCA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Proyecto</label>
              <select
                name="projectId"
                defaultValue={forecast?.projectId ?? ""}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">Sin proyecto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Descripción</label>
            <input
              type="text"
              name="description"
              defaultValue={forecast?.description ?? ""}
              placeholder="Ej. Proyecto cliente X, campaña Q3…"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Importe pesimista (EUR) *</label>
              <input
                type="number"
                name="amountPessimistic"
                required
                min="0"
                step="0.01"
                defaultValue={forecast ? Number(forecast.amountPessimistic) : ""}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Importe optimista (EUR) *</label>
              <input
                type="number"
                name="amountOptimistic"
                required
                min="0"
                step="0.01"
                defaultValue={forecast ? Number(forecast.amountOptimistic) : ""}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {pending ? "Guardando…" : forecast ? "Guardar cambios" : "Crear previsión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
