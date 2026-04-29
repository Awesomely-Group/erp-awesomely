"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MARCA_FILTER_UNASSIGNED, MARCA_OPTIONS } from "@/lib/org";

const PERIODS = [
  { value: "", label: "Últimos 12 meses (por defecto)" },
  { value: "last_3_months", label: "Últimos 3 meses" },
  { value: "last_6_months", label: "Últimos 6 meses" },
  { value: "last_12_months", label: "Últimos 12 meses" },
  { value: "this_year", label: "Año en curso" },
  { value: "custom", label: "Personalizado…" },
];

type Company = { id: string; name: string };

type AccountOption = { num: string; name: string | null };

export function CashflowFilters({
  companies,
  accounts,
}: {
  companies: Company[];
  accounts: AccountOption[];
}): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [period, setPeriod] = useState(sp.get("period") ?? "");
  const [dateFrom, setDateFrom] = useState(sp.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(sp.get("dateTo") ?? "");
  const [marca, setMarca] = useState(sp.get("marca") ?? "");
  const [company, setCompany] = useState(sp.get("company") ?? "");
  const [type, setType] = useState(sp.get("type") ?? "");
  const [account, setAccount] = useState(sp.get("account") ?? "");

  function apply(): void {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (period === "custom") {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    if (marca) params.set("marca", marca);
    if (company) params.set("company", company);
    if (type) params.set("type", type);
    if (account) params.set("account", account);
    router.push(`/cashflow?${params.toString()}`);
  }

  function reset(): void {
    setPeriod("");
    setDateFrom("");
    setDateTo("");
    setMarca("");
    setCompany("");
    setType("");
    setAccount("");
    router.push("/cashflow");
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Periodo</label>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
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
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <select
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
        >
          <option value="">Todas</option>
          <option value={MARCA_FILTER_UNASSIGNED}>Sin asignar</option>
          {MARCA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Entidad legal</label>
        <select
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
        >
          <option value="">Todas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
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

      {accounts.length > 0 && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500 font-medium">Cuenta contable</label>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
          >
            <option value="">Todas</option>
            {accounts.map((a) => (
              <option key={a.num} value={a.num}>
                {a.name ? `${a.num} · ${a.name}` : a.num}
              </option>
            ))}
          </select>
        </div>
      )}

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
