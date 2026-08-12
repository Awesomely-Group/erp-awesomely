"use client";

import { useMemo, useState, useTransition } from "react";
import { ForecastFrequency, ForecastType } from "@prisma/client";
import { MARCA_OPTIONS } from "@/lib/org";
import { MAX_OCCURRENCES, calculateOccurrenceDates } from "@/lib/forecast-recurrence";
import { createForecast, updateForecast } from "./actions";
import { createForecastRecurrence } from "./recurrence-actions";
import {
  AccountMappingSelect,
  SupplierSelect,
  type AccountMappingOption,
  type SupplierOption,
} from "./forecast-classification-fields";

type Project = { id: string; name: string };

type ForecastRow = {
  id: string;
  month: Date;
  type: ForecastType;
  marca: string | null;
  projectId: string | null;
  accountMappingId?: string | null;
  supplierId?: string | null;
  description: string | null;
  amountOptimistic: unknown;
  amountPessimistic: unknown;
};

type Mode = "oneshot" | "recurrence";

const FREQUENCY_OPTIONS: { value: ForecastFrequency; label: string }[] = [
  { value: ForecastFrequency.DAILY, label: "Diaria" },
  { value: ForecastFrequency.WEEKLY, label: "Semanal" },
  { value: ForecastFrequency.MONTHLY, label: "Mensual" },
  { value: ForecastFrequency.YEARLY, label: "Anual" },
];

function toMonthValue(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function ForecastForm({
  forecast,
  projects,
  accountMappings,
  suppliers,
  onClose,
}: {
  forecast?: ForecastRow;
  projects: Project[];
  accountMappings: AccountMappingOption[];
  suppliers: SupplierOption[];
  onClose: () => void;
}): React.JSX.Element {
  const isEditing = !!forecast;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("oneshot");

  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Estado de recurrencia (solo se usa en modo "recurrence")
  const [frequency, setFrequency] = useState<ForecastFrequency>(ForecastFrequency.MONTHLY);
  const [endMode, setEndMode] = useState<"date" | "occurrences">("occurrences");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState("");
  const [occurrences, setOccurrences] = useState(12);

  const previewCount = useMemo(() => {
    if (mode !== "recurrence" || !startDate) return 0;
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = endMode === "date" && endDate ? new Date(`${endDate}T00:00:00.000Z`) : null;
    const occ = endMode === "occurrences" ? occurrences : null;
    return calculateOccurrenceDates(start, frequency, end, occ).length;
  }, [mode, startDate, endDate, occurrences, endMode, frequency]);

  const max = MAX_OCCURRENCES[frequency];
  const overLimit = mode === "recurrence" && previewCount > max;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const type = fd.get("type") as ForecastType;
    const marca = (fd.get("marca") as string) || null;
    const projectId = (fd.get("projectId") as string) || null;
    const accountMappingId = (fd.get("accountMappingId") as string) || null;
    const supplierId = (fd.get("supplierId") as string) || null;
    const description = (fd.get("description") as string) || null;

    if (!marca || !accountMappingId) {
      setError("Por favor rellena todos los campos obligatorios (marca y cuenta contable).");
      return;
    }

    if (mode === "oneshot") {
      const month = fd.get("month") as string;
      const amountOptimistic = parseFloat(fd.get("amountOptimistic") as string);
      const amountPessimistic = parseFloat(fd.get("amountPessimistic") as string);

      if (!month || isNaN(amountOptimistic) || isNaN(amountPessimistic)) {
        setError("Por favor rellena todos los campos obligatorios (mes e importes).");
        return;
      }

      setError(null);
      startTransition(async () => {
        if (forecast) {
          await updateForecast(forecast.id, {
            month, type, marca, projectId, accountMappingId, supplierId, description,
            amountOptimistic, amountPessimistic,
          });
        } else {
          await createForecast({
            month, type, marca, projectId, accountMappingId, supplierId, description,
            amountOptimistic, amountPessimistic,
          });
        }
        onClose();
      });
      return;
    }

    // mode === "recurrence"
    const amount = parseFloat(fd.get("amount") as string);
    if (isNaN(amount)) {
      setError("Por favor indica el importe por ocurrencia.");
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
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? "Editar previsión" : "Nueva previsión"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {!isEditing && (
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm mb-4 w-fit">
            <button
              type="button"
              onClick={() => setMode("oneshot")}
              className={`px-3 py-1.5 transition-colors ${
                mode === "oneshot" ? "bg-indigo-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              OneShot
            </button>
            <button
              type="button"
              onClick={() => setMode("recurrence")}
              className={`px-3 py-1.5 border-l border-gray-300 transition-colors ${
                mode === "recurrence" ? "bg-indigo-600 text-white font-medium" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Recurrente
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {mode === "oneshot" ? (
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
            ) : (
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
            )}
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

          {mode === "recurrence" && (
            <>
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
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Marca *</label>
              <select
                name="marca"
                required
                defaultValue={forecast?.marca ?? ""}
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

          <AccountMappingSelect
            accountMappings={accountMappings}
            defaultAccountMappingId={forecast?.accountMappingId}
          />

          <SupplierSelect suppliers={suppliers} defaultSupplierId={forecast?.supplierId} />

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

          {mode === "oneshot" ? (
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
          ) : (
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
                Se usará el mismo importe en cada previsión generada; después puedes editar cada
                una de forma independiente.
              </p>
            </div>
          )}

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
              {pending
                ? "Guardando…"
                : mode === "recurrence"
                  ? `Crear ${previewCount || ""} previsiones`.trim()
                  : isEditing
                    ? "Guardar cambios"
                    : "Crear previsión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
