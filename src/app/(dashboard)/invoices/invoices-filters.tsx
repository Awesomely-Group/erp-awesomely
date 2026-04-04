"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { EMPRESA_OPTIONS, MARCA_OPTIONS } from "@/lib/org";

const PERIODS = [
  { value: "", label: "Todos los periodos" },
  { value: "this_month", label: "Este mes" },
  { value: "last_month", label: "Mes pasado" },
  { value: "this_quarter", label: "Este trimestre" },
  { value: "last_quarter", label: "Trimestre pasado" },
  { value: "this_year", label: "Este año" },
  { value: "last_year", label: "Año pasado" },
  { value: "custom", label: "Personalizado…" },
];

export function InvoicesFilters(): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get("search") ?? "");
  const [period, setPeriod] = useState(sp.get("period") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("dateTo") ?? "");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [type, setType] = useState(sp.get("type") ?? "");
  const [empresa, setEmpresa] = useState(sp.get("empresa") ?? "");
  const [marca, setMarca] = useState(sp.get("marca") ?? "");

  function apply(): void {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    if (empresa) params.set("empresa", empresa);
    if (marca) params.set("marca", marca);
    if (period) params.set("period", period);
    if (period === "custom") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    router.push(`/invoices?${params.toString()}`);
  }

  function reset(): void {
    setSearch("");
    setPeriod("");
    setDateFrom("");
    setDateTo("");
    setStatus("");
    setType("");
    setEmpresa("");
    setMarca("");
    router.push("/invoices");
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Buscar</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="Número o contraparte…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white w-52"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Periodo</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {period === "custom" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Estado</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Todos</option>
          <option value="PENDING">Sin clasificar</option>
          <option value="PARTIAL">Parcial</option>
          <option value="CLASSIFIED">Clasificado</option>
          <option value="REVIEWED">Revisado</option>
          <option value="APPROVED">Aprobado</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Tipo</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Compra y venta</option>
          <option value="SALE">Venta</option>
          <option value="PURCHASE">Compra</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Empresa</label>
        <select
          value={empresa}
          onChange={(e) => setEmpresa(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
        >
          <option value="">Todas</option>
          {EMPRESA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <select
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
        >
          <option value="">Todas</option>
          {MARCA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={apply}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Filtrar
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Limpiar
        </button>
      </div>
    </div>
  );
}
