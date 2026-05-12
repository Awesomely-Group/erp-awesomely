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

const MARCA_ALL_OPTIONS = [
  { value: MARCA_FILTER_UNASSIGNED, label: "Sin asignar" },
  ...MARCA_OPTIONS,
];

const L1_OPTIONS = [
  { value: "REVENUE", label: "Revenue" },
  { value: "COGS", label: "COGS" },
  { value: "CAPEX", label: "CAPEX" },
] as const;

type Company = { id: string; name: string };
type AccountOption = { num: string; name: string };

function ChevronIcon({ open }: { open: boolean }): React.JSX.Element {
  return (
    <svg
      className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

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
  const [company, setCompany] = useState(sp.get("company") ?? "");
  const [scenario, setScenario] = useState(sp.get("scenario") ?? "pessimistic");

  const [selectedMarcas, setSelectedMarcas] = useState<string[]>(
    sp.get("marca")?.split(",").filter(Boolean) ?? []
  );
  const [marcasOpen, setMarcasOpen] = useState(false);
  const marcasContainerRef = useRef<HTMLDivElement>(null);

  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(
    sp.get("account")?.split(",").filter(Boolean) ?? []
  );
  const [accountsOpen, setAccountsOpen] = useState(false);
  const accountsContainerRef = useRef<HTMLDivElement>(null);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedL1, setSelectedL1] = useState<string[]>(
    sp.get("l1")?.split(",").filter(Boolean) ?? []
  );
  const [l1Open, setL1Open] = useState(false);
  const l1ContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!marcasOpen) return;
    function handlePointerDown(e: PointerEvent): void {
      if (marcasContainerRef.current && !marcasContainerRef.current.contains(e.target as Node)) {
        setMarcasOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [marcasOpen]);

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

  useEffect(() => {
    if (!l1Open) return;
    function handlePointerDown(e: PointerEvent): void {
      if (l1ContainerRef.current && !l1ContainerRef.current.contains(e.target as Node)) {
        setL1Open(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [l1Open]);

  function applyWith(overrides: Partial<{
    period: string; dateFrom: string; dateTo: string;
    marca: string; company: string; account: string; l1: string; scenario: string;
  }>): void {
    const m = {
      period, dateFrom, dateTo, company, scenario,
      marca: selectedMarcas.join(","),
      account: selectedAccounts.join(","),
      l1: selectedL1.join(","),
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
    if (m.account) params.set("account", m.account);
    if (m.l1) params.set("l1", m.l1);
    if (m.scenario && m.scenario !== "pessimistic") params.set("scenario", m.scenario);
    router.push(`/cashflow?${params.toString()}`);
  }

  function toggleMarca(value: string): void {
    const next = selectedMarcas.includes(value)
      ? selectedMarcas.filter((m) => m !== value)
      : [...selectedMarcas, value];
    setSelectedMarcas(next);
    applyWith({ marca: next.join(",") });
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

  function toggleL1(value: string): void {
    const next = selectedL1.includes(value)
      ? selectedL1.filter((v) => v !== value)
      : [...selectedL1, value];
    setSelectedL1(next);
    applyWith({ l1: next.join(",") });
  }

  function reset(): void {
    setPeriod("");
    setDateFrom("");
    setDateTo("");
    setCompany("");
    setScenario("pessimistic");
    setSelectedMarcas([]);
    setMarcasOpen(false);
    setSelectedAccounts([]);
    setAccountsOpen(false);
    setSelectedL1([]);
    setL1Open(false);
    if (applyTimerRef.current) clearTimeout(applyTimerRef.current);
    router.push("/cashflow");
  }

  const marcaLabel =
    selectedMarcas.length === 0
      ? "Todas"
      : selectedMarcas.length === 1
        ? (MARCA_ALL_OPTIONS.find((o) => o.value === selectedMarcas[0])?.label ?? selectedMarcas[0])
        : `${selectedMarcas.length} seleccionadas`;

  const accountLabel =
    selectedAccounts.length === 0
      ? "Todas"
      : selectedAccounts.length === 1
        ? (accounts.find((a) => a.num === selectedAccounts[0])?.name ?? selectedAccounts[0])
        : `${selectedAccounts.length} seleccionadas`;

  const l1Label =
    selectedL1.length === 0
      ? "Todas"
      : selectedL1.length === 1
        ? (L1_OPTIONS.find((o) => o.value === selectedL1[0])?.label ?? selectedL1[0])
        : `${selectedL1.length} seleccionadas`;

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

      {/* Marca multiselect */}
      <div className="flex flex-col gap-1" ref={marcasContainerRef}>
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMarcasOpen((o) => !o)}
            className={`rounded-lg border px-3 py-2 text-sm bg-white text-left min-w-[11rem] flex items-center justify-between gap-2 transition-colors ${
              selectedMarcas.length > 0
                ? "border-indigo-500 text-indigo-700"
                : "border-gray-300 text-gray-700"
            }`}
          >
            <span className="truncate">{marcaLabel}</span>
            <ChevronIcon open={marcasOpen} />
          </button>

          {marcasOpen && (
            <div className="absolute top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[13rem]">
              {MARCA_ALL_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedMarcas.includes(o.value)}
                    onChange={() => toggleMarca(o.value)}
                    className="rounded border-gray-300 text-indigo-600 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-800">{o.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Categoría (l1) multiselect */}
      <div className="flex flex-col gap-1" ref={l1ContainerRef}>
        <label className="text-xs text-gray-500 font-medium">Categoría</label>
        <div className="relative">
          <button
            type="button"
            onClick={() => setL1Open((o) => !o)}
            className={`rounded-lg border px-3 py-2 text-sm bg-white text-left min-w-[10rem] flex items-center justify-between gap-2 transition-colors ${
              selectedL1.length > 0
                ? "border-indigo-500 text-indigo-700"
                : "border-gray-300 text-gray-700"
            }`}
          >
            <span className="truncate">{l1Label}</span>
            <ChevronIcon open={l1Open} />
          </button>

          {l1Open && (
            <div className="absolute top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[10rem]">
              {L1_OPTIONS.map((o) => (
                <label
                  key={o.value}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedL1.includes(o.value)}
                    onChange={() => toggleL1(o.value)}
                    className="rounded border-gray-300 text-indigo-600 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-800">{o.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
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
              <ChevronIcon open={accountsOpen} />
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

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Escenario previsión</label>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => { setScenario("pessimistic"); applyWith({ scenario: "pessimistic" }); }}
            className={`px-3 py-2 transition-colors ${
              scenario === "pessimistic" || !scenario
                ? "bg-blue-600 text-white font-medium"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Pesimista
          </button>
          <button
            type="button"
            onClick={() => { setScenario("optimistic"); applyWith({ scenario: "optimistic" }); }}
            className={`px-3 py-2 border-l border-gray-300 transition-colors ${
              scenario === "optimistic"
                ? "bg-blue-600 text-white font-medium"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Optimista
          </button>
        </div>
      </div>

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
