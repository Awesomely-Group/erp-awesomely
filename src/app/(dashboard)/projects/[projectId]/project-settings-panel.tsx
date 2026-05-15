"use client";

import React, { useState, useTransition, useRef, useEffect } from "react";
import { updateProjectTypes, upsertHourBucket, deleteHourBucket, toggleHourBucketActive, upsertRegularFeeEntry, deleteRegularFeeEntry } from "../actions";

interface SupplierRoleOption {
  id: string;
  name: string;
  supplierName: string;
  ratePerHour: number;
}

interface ExistingBucket {
  id: string;
  roleId: string;
  roleName: string;
  supplierName: string;
  ratePerHour: number;
  totalHours: number;
  alertThreshold: number;
  active: boolean;
}

export interface RegularFeeEntryData {
  id: string;
  label: string;
  monthlyFee: number;
  maxHoursPerMonth: number;
}

interface ProjectConfig {
  isPrecioCerrado: boolean;
  isBolsasHoras: boolean;
  isFeeRegular: boolean;
  fixedPrice: number | null;
  budgetedHours: number | null;
  hourBuckets: ExistingBucket[];
  regularFeeEntries: RegularFeeEntryData[];
}

interface Props {
  projectId: string;
  config: ProjectConfig;
  availableRoles: SupplierRoleOption[];
}

interface BucketFormState {
  roleId: string;
  totalHours: string;
  alertThreshold: string;
}

interface FeeFormState {
  label: string;
  monthlyFee: string;
  maxHoursPerMonth: string;
}

export function ProjectSettingsPanel({ projectId, config, availableRoles }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  // Form state
  const [isPrecioCerrado, setIsPrecioCerrado] = useState(config.isPrecioCerrado);
  const [isBolsasHoras, setIsBolsasHoras] = useState(config.isBolsasHoras);
  const [isFeeRegular, setIsFeeRegular] = useState(config.isFeeRegular);
  const [fixedPrice, setFixedPrice] = useState(config.fixedPrice?.toString() ?? "");
  const [budgetedHours, setBudgetedHours] = useState(config.budgetedHours?.toString() ?? "");

  // New bucket form
  const [showBucketForm, setShowBucketForm] = useState(false);
  const [bucketForm, setBucketForm] = useState<BucketFormState>({
    roleId: availableRoles[0]?.id ?? "",
    totalHours: "",
    alertThreshold: "80",
  });

  // New fee entry form
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [feeForm, setFeeForm] = useState<FeeFormState>({ label: "", monthlyFee: "", maxHoursPerMonth: "" });

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function handleSaveTypes(): void {
    startTransition(async () => {
      await updateProjectTypes(projectId, {
        isPrecioCerrado,
        isBolsasHoras,
        isFeeRegular,
        fixedPrice: fixedPrice ? parseFloat(fixedPrice) : null,
        budgetedHours: budgetedHours ? parseFloat(budgetedHours) : null,
      });
      setOpen(false);
    });
  }

  function handleAddBucket(): void {
    if (!bucketForm.roleId || !bucketForm.totalHours) return;
    startTransition(async () => {
      await upsertHourBucket(projectId, {
        roleId: bucketForm.roleId,
        totalHours: parseFloat(bucketForm.totalHours),
        alertThreshold: parseFloat(bucketForm.alertThreshold) / 100,
      });
      setShowBucketForm(false);
      setBucketForm({ roleId: availableRoles[0]?.id ?? "", totalHours: "", alertThreshold: "80" });
    });
  }

  function handleDeleteBucket(bucketId: string): void {
    startTransition(async () => {
      await deleteHourBucket(bucketId, projectId);
    });
  }

  function handleToggleBucketActive(bucketId: string, active: boolean): void {
    startTransition(async () => {
      await toggleHourBucketActive(bucketId, projectId, active);
    });
  }

  function handleAddFeeEntry(): void {
    if (!feeForm.label || !feeForm.monthlyFee || !feeForm.maxHoursPerMonth) return;
    startTransition(async () => {
      await upsertRegularFeeEntry(projectId, {
        label: feeForm.label,
        monthlyFee: parseFloat(feeForm.monthlyFee),
        maxHoursPerMonth: parseFloat(feeForm.maxHoursPerMonth),
      });
      setShowFeeForm(false);
      setFeeForm({ label: "", monthlyFee: "", maxHoursPerMonth: "" });
    });
  }

  function handleDeleteFeeEntry(entryId: string): void {
    startTransition(async () => {
      await deleteRegularFeeEntry(entryId, projectId);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Configurar
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Side panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Configuración del proyecto</h2>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Tipo toggles */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Tipo de proyecto</h3>
            <p className="text-xs text-gray-400 mb-4">Puedes activar varios tipos a la vez.</p>
            <div className="space-y-3">
              <Toggle
                label="Precio cerrado"
                description="Se vende un precio fijo por un alcance acordado."
                checked={isPrecioCerrado}
                onChange={setIsPrecioCerrado}
              />
              <Toggle
                label="Bolsas de horas"
                description="Se venden paquetes de horas por perfil, con alertas de consumo."
                checked={isBolsasHoras}
                onChange={setIsBolsasHoras}
              />
              <Toggle
                label="Fee regular"
                description="Fees mensuales por persona, con horas máximas por período."
                checked={isFeeRegular}
                onChange={setIsFeeRegular}
              />
            </div>
          </section>

          {/* Precio cerrado fields */}
          {isPrecioCerrado && (
            <section className="bg-blue-50 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-blue-800">Precio cerrado</h3>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Precio cerrado (€)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fixedPrice}
                  onChange={(e) => setFixedPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Horas presupuestadas</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={budgetedHours}
                  onChange={(e) => setBudgetedHours(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </section>
          )}

          {/* Fee regular — lista de entradas por persona */}
          {isFeeRegular && (
            <section className="bg-purple-50 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-purple-800">Fee regular</h3>
              <p className="text-xs text-purple-700">Añade un fee por persona o perfil con su cap de horas mensual.</p>

              {/* Existing entries */}
              {config.regularFeeEntries.length > 0 && (
                <div className="space-y-2">
                  {config.regularFeeEntries.map((e) => (
                    <div key={e.id} className="flex items-center justify-between bg-white rounded-lg border border-purple-200 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{e.label}</p>
                        <p className="text-xs text-gray-400">
                          {e.monthlyFee.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}/mes · {e.maxHoursPerMonth} h/mes
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteFeeEntry(e.id)}
                        disabled={isPending}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {/* Summary row */}
                  <div className="flex justify-between text-xs font-medium text-purple-700 px-1 pt-1">
                    <span>Total mensual</span>
                    <span>
                      {config.regularFeeEntries.reduce((s, e) => s + e.monthlyFee, 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" })}
                      {" / "}
                      {config.regularFeeEntries.reduce((s, e) => s + e.maxHoursPerMonth, 0)} h
                    </span>
                  </div>
                </div>
              )}

              {/* Add fee entry form */}
              {showFeeForm ? (
                <div className="bg-white rounded-lg border border-purple-200 p-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / Persona</label>
                    <input
                      type="text"
                      value={feeForm.label}
                      onChange={(e) => setFeeForm((prev) => ({ ...prev, label: e.target.value }))}
                      placeholder="Ej: Victor, Laura, Diseño UX…"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Fee mensual (€)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={feeForm.monthlyFee}
                        onChange={(e) => setFeeForm((prev) => ({ ...prev, monthlyFee: e.target.value }))}
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Horas máx./mes</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={feeForm.maxHoursPerMonth}
                        onChange={(e) => setFeeForm((prev) => ({ ...prev, maxHoursPerMonth: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddFeeEntry}
                      disabled={isPending || !feeForm.label || !feeForm.monthlyFee || !feeForm.maxHoursPerMonth}
                      className="flex-1 rounded-lg bg-purple-600 text-white text-sm font-medium py-2 hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      Añadir
                    </button>
                    <button
                      onClick={() => setShowFeeForm(false)}
                      className="px-3 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowFeeForm(true)}
                  className="w-full rounded-lg border border-dashed border-purple-300 text-purple-700 text-sm py-2 hover:bg-purple-100 transition-colors"
                >
                  + Añadir persona / fee
                </button>
              )}
            </section>
          )}

          {/* Bolsas de horas */}
          {isBolsasHoras && (
            <section className="bg-amber-50 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-amber-800">Bolsas de horas</h3>

              {/* Existing buckets */}
              {config.hourBuckets.length > 0 && (
                <div className="space-y-2">
                  {config.hourBuckets.map((b) => (
                    <div key={b.id} className={`flex items-center justify-between bg-white rounded-lg border px-3 py-2.5 ${b.active ? "border-amber-200" : "border-gray-200 opacity-60"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-800">{b.roleName}</p>
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${b.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {b.active ? "Activa" : "Inactiva"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{b.supplierName} · {b.totalHours}h · alerta {Math.round(b.alertThreshold * 100)}%</p>
                      </div>
                      <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                        <button
                          onClick={() => handleToggleBucketActive(b.id, !b.active)}
                          disabled={isPending}
                          title={b.active ? "Desactivar bolsa" : "Activar bolsa"}
                          className={`p-1 rounded transition-colors ${b.active ? "text-green-600 hover:text-amber-600 hover:bg-amber-50" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            {b.active
                              ? <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              : <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            }
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteBucket(b.id)}
                          disabled={isPending}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add bucket form */}
              {showBucketForm ? (
                <div className="bg-white rounded-lg border border-amber-200 p-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Perfil / Rol</label>
                    <select
                      value={bucketForm.roleId}
                      onChange={(e) => setBucketForm((prev) => ({ ...prev, roleId: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {availableRoles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} — {r.supplierName} ({r.ratePerHour}€/h)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Horas totales</label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={bucketForm.totalHours}
                        onChange={(e) => setBucketForm((prev) => ({ ...prev, totalHours: e.target.value }))}
                        placeholder="0"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Alerta al (%)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="5"
                        value={bucketForm.alertThreshold}
                        onChange={(e) => setBucketForm((prev) => ({ ...prev, alertThreshold: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddBucket}
                      disabled={isPending || !bucketForm.totalHours}
                      className="flex-1 rounded-lg bg-amber-600 text-white text-sm font-medium py-2 hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      Añadir bolsa
                    </button>
                    <button
                      onClick={() => setShowBucketForm(false)}
                      className="px-3 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowBucketForm(true)}
                  disabled={availableRoles.length === 0}
                  className="w-full rounded-lg border border-dashed border-amber-300 text-amber-700 text-sm py-2 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                >
                  + Añadir bolsa de horas
                </button>
              )}

              {availableRoles.length === 0 && (
                <p className="text-xs text-amber-700">No hay roles de proveedor disponibles. Añade roles en la sección de Proveedores.</p>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={handleSaveTypes}
            disabled={isPending}
            className="flex-1 rounded-lg bg-gray-900 text-white text-sm font-medium py-2.5 hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="px-4 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
      <div className="relative mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div className={`w-10 h-6 rounded-full transition-colors ${checked ? "bg-gray-900" : "bg-gray-200"}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
    </label>
  );
}
