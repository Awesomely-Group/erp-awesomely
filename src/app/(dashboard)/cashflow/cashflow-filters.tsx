"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
type AccountOption = { num: string; name: string };

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

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    sp.get("account")?.split(",").filter(Boolean) ?? []
  );
  const [accountsOpen, setAccountsOpen] = useState(false);
  const accountsContainerRef = useRef<HTMLDivElement>(null);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!accountsOpen) return;
    function handlePointerDown(e: PointerEvent): void {
      if (accountsContainerRef.current && !accountsContainerRef.current.contains(e.target as Node)) {
        setAccountsOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [accountsOpen]);

  function applyWith(overrides: Partial<{
    period: string; dateFrom: string; dateTo: string;
    marca: string; company: string; type: string; account: string;
  }>): void {
    const m = {
      period, dateFrom, dateTo, marca, company, type,
      account: selectedAccounts.join(","),
      ...overrides,
    };
    const params = new URLSearchParams();
    if (m.period) {
      params.set("period", m.period);
      if (m.period === "custom") {
        if (m.dateFrom) params.set("dateFrom", m.dateFrom);
        if (m.dateTo) params.set("dateTo", m.dateTo);
      }
    }
    if (m.marca) params.set("marca", m.marca);
    if (m.company) params.set("company", m.company);
    if (m.type) params.set("type", m.type);
    if (m.account) params.set("account", m.account);
    router.push(`/cashflow?${params.toString()}`);
  }

  function toggleAccount(num: string): void {
    const next = selectedAccounts.includes(num)
      ? selectedAccounts.filter((a) => a !== num)
      : [...selectedAccounts, num];
    setSelectedAccounts(next);

    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    applyTimerRef.current = setTimeout(() => {
      applyWith({ account: next.join(",") });
    }, 600);
  }

  function reset(): void {
    setPeriod("");
    setDateFrom("");
    setDateTo("");
    setMarca("");
    setCompany("");
    setType("");
    setSelectedAccounts([]);
    setAccountsOpen(false);
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    router.push("/cashflow");
  }

  const accountLabel =
    selectedAccounts.length === 0
      ? "Todas"
      : selectedAccounts.length === 1
        ? (accounts.find((a) => a.num === selectedAccounts[0])?.name ?? selectedAccounts[0])
        : `${selectedAccounts.length} seleccionadas`;

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Periodo</label>
        <select
          value={period}
          onChange={(e) => {
            const v = e.target.value;
            setPeriod(v);
            if (v !== "custom") applyWith({ period: v, dateFrom: "", dateTo: "" });
          }}
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
              onBlur={(e) => applyWith({ dateFrom: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              onBlur={(e) => applyWith({ dateTo: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <select
          value={marca}
          onChange={(e) => { const v = e.target.value; setMarca(v); applyWith({ marca: v }); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
        >
          <option value="">Todas</option>
          <option value={MARCA_FILTER_UNASSIGNED}>Sin asignar</option>
          {MARCA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Entidad legal</label>
        <select
          value={company}
          onChange={(e) => { const v = e.target.value; setCompany(v); applyWith({ company: v }); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white min-w-[11rem]"
        >
          <option value="">Todas</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Tipo</label>
        <select
          value={type}
          onChange={(e) => { const v = e.target.value; setType(v); applyWith({ type: v }); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">Compra y venta</option>
          <option value="SALE">Venta</option>
          <option value="PURCHASE">Compra</option>
        </select>
      </div>

      {accounts.length > 0 && (
        <div className="flex flex-col gap-1" ref={accountsContainerRef}>
          <label className="text-xs text-gray-500 font-medium">Cuenta contable</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setAccountsOpen((o) => !o)}
              className={`rounded-lg border px-3 py-2 text-sm bg-white text-left min-w-[13rem] flex items-center justify-between gap-2 transition-colors ${
                selectedAccounts.length > 0
                  ? "border-indigo-500 text-indigo-700"
                  : "border-gray-300 text-gray-700"
              }`}
            >
              <span className="truncate">{accountLabel}</span>
              <svg
                className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${accountsOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20" fill="currentColor"
              >
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>

            {accountsOpen && (
              <div className="absolute top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[16rem] max-h-64 overflow-y-auto">
                {accounts.map((a) => (
                  <label
                    key={a.num}
                    className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAccounts.includes(a.num)}
                      onChange={() => toggleAccount(a.num)}
                      className="mt-0.5 rounded border-gray-300 text-indigo-600 flex-shrink-0"
                    />
                    <span className="text-sm leading-snug text-gray-800">{a.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={reset}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        Limpiar
      </button>
    </div>
  );
}
