"use client";

import { useMemo, useState, useTransition } from "react";
import { ForecastFrequency, ForecastType } from "@prisma/client";
import { MARCA_OPTIONS } from "@/lib/org";
import { MAX_OCCURRENCES, calculateOccurrenceDates } from "@/lib/forecast-recurrence";
import { createForecastRecurrence } from "./recurrence-actions";
import {
  AccountMappingSelect,
  SupplierSelect,
  type AccountMappingOption,
  type SupplierOption,
} from "./forecast-classification-fields";

type Project = { id: string; name: string };

const FREQUENCY_OPTIONS: { value: ForecastFrequency; label: string }[] = [
  { value: ForecastFrequency.DAILY, label: "Diaria" },
  { value: ForecastFrequency.WEEKLY, label: "Semanal" },
  { value: ForecastFrequency.MONTHLY, label: "Mensual" },
  { value: ForecastFrequency.YEARLY, label: "Anual" },
];

export function ForecastRecurrenceForm({
  projects,
  accountMappings,
  suppliers,
  onClose,
}: {
  projects: Project[];
  accountMappings: AccountMappingOption[];
  suppliers: SupplierOption[];
  onClose: () => void;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const [frequency, setFrequency] = useState<ForecastFrequency>(ForecastFrequency.MONTHLY);
  const [endMode, setEndMode] = useState<"date" | "occurrences">("occurrences");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState("");
  const [occurrences, setOccurrences] = useState(12);

  const previewCount = useMemo(() => {
    if (!startDate) return 0;
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = endMode === "date" && endDate ? new Date(`${endDate}T00:00:00.000Z`) : null;
    const occ = endMode === "occurrences" ? occurrences : null;
    return calculateOccurrenceDates(start, frequency, end, occ).length;
  }, [startDate, endDate, occurrences, endMode, frequency]);

  const max = MAX_OCCURRENCES[frequency];
  const overLimit = previewCount > max;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = fd.get("type") as ForecastType;
    const marca = (fd.get("marca") as string) || null;
    const projectId = (fd.get("projectId") as string) || null;
    const accountMappingId = (fd.get("accountMappingId") as string) || null;
    const supplierId = (fd.get("supplierId") as string) || null;
    const description = (fd.get("description") as string) || null;
    const amount = parseFloat(fd.get("amount") as string);

    if (!marca || !accountMappingId || isNaN(amount)) {
      setError("Por favor rellena todos los campos obligatorios (marca, cuenta contable e importe).");
      return;
    }
    if (overLimit) {
      setError(`Se generarían ${previewCount} previsiones, por encima del límite de ${max} para esta frecuencia.`);
      return;
    }
    if (previewCount === 0) {
      setError("El rango indicado no genera ninguna previsión.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await createForecastRecurrence({
        frequency,
        startDate,
        endDate: endMode === "date" ? endDate || null : null,
        occurrences: endMode === "occurrences" ? occurrences : null,
        type,
        marca,
        projectId,
        accountMappingId,
        supplierId,
        description,
        amount,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Nueva previsión recurrente</h2>
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
              <label className="text-xs font-medium text-gray-600">Frecuencia *</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ForecastFrequency)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Tipo *</label>
              <select
                name="type"
                required
                defaultValue={ForecastType.EXPENSE}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value={ForecastType.INCOME}>Ingreso</option>
                <option value={ForecastType.EXPENSE}>Gasto</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Fecha de inicio *</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-600">Fin de la recurrencia *</label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm w-fit">
              <button
                type="button"
                onClick={() => setEndMode("occurrences")}
                className={`px-3 py-1.5 transition-colors ${
                  endMode === "occurrences" ? "bg-indigo-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Nº de ocurrencias
              </button>
              <button
                type="button"
                onClick={() => setEndMode("date")}
                className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
                  endMode === "date" ? "bg-indigo-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                Fecha de fin
              </button>
            </div>
            {endMode === "occurrences" ? (
              <input
                type="number"
                min={1}
                required
                value={occurrences}
                onChange={(e) => setOccurrences(parseInt(e.target.value, 10) || 0)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            ) : (
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              />
            )}
            <p className={`text-xs ${overLimit ? "text-red-600 font-medium" : "text-gray-500"}`}>
              Se generarán <strong>{previewCount}</strong> previsión{previewCount !== 1 ? "es" : ""}
              {overLimit ? ` — supera el límite de ${max} para esta frecuencia` : ""}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Marca *</label>
              <select
                name="marca"
                required
                defaultValue=""
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">Selecciona…</option>
                {MARCA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Proyecto</label>
              <select
                name="projectId"
                defaultValue=""
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
              >
                <option value="">Sin proyecto</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <AccountMappingSelect accountMappings={accountMappings} />

          <SupplierSelect suppliers={suppliers} />

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Descripción</label>
            <input
              type="text"
              name="description"
              placeholder="Ej. Alquiler oficina, suscripción SaaS…"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Importe por ocurrencia (EUR) *</label>
            <input
              type="number"
              name="amount"
              required
              min="0"
              step="0.01"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
            <p className="text-xs text-gray-400">
              Se usará el mismo importe en cada previsión generada; después puedes editar cada una
              de forma independiente.
            </p>
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
              disabled={pending || overLimit}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {pending ? "Generando…" : `Crear ${previewCount || ""} previsiones`.trim()}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
