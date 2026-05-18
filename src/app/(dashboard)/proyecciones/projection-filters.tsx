"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MARCA_FILTER_UNASSIGNED, MARCA_OPTIONS } from "@/lib/org";

const BASE_PERIODS = [
  { value: "3",  label: "Últimos 3 meses" },
  { value: "6",  label: "Últimos 6 meses" },
  { value: "12", label: "Últimos 12 meses" },
];

const MARCA_ALL_OPTIONS = [
  { value: MARCA_FILTER_UNASSIGNED, label: "Sin asignar" },
  ...MARCA_OPTIONS,
];

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

export function ProjectionFilters(): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [basePeriod, setBasePeriod] = useState(sp.get("basePeriod") ?? "6");
  const [margin, setMargin] = useState(sp.get("margin") ?? "20");
  const [selectedMarcas, setSelectedMarcas] = useState<string[]>(
    sp.get("marca")?.split(",").filter(Boolean) ?? []
  );
  const [marcasOpen, setMarcasOpen] = useState(false);
  const marcasContainerRef = useRef<HTMLDivElement>(null);

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

  function applyWith(overrides: Partial<{ basePeriod: string; margin: string; marca: string }>): void {
    const m = {
      basePeriod,
      margin,
      marca: selectedMarcas.join(","),
      ...overrides,
    };
    const params = new URLSearchParams();
    if (m.basePeriod && m.basePeriod !== "6") params.set("basePeriod", m.basePeriod);
    if (m.margin && m.margin !== "20") params.set("margin", m.margin);
    if (m.marca) params.set("marca", m.marca);
    router.push(`/proyecciones?${params.toString()}`);
  }

  function toggleMarca(value: string): void {
    const next = selectedMarcas.includes(value)
      ? selectedMarcas.filter((m) => m !== value)
      : [...selectedMarcas, value];
    setSelectedMarcas(next);
    applyWith({ marca: next.join(",") });
  }

  function reset(): void {
    setBasePeriod("6");
    setMargin("20");
    setSelectedMarcas([]);
    setMarcasOpen(false);
    router.push("/proyecciones");
  }

  const marcaLabel =
    selectedMarcas.length === 0
      ? "Todas"
      : selectedMarcas.length === 1
        ? (MARCA_ALL_OPTIONS.find((o) => o.value === selectedMarcas[0])?.label ?? selectedMarcas[0])
        : `${selectedMarcas.length} seleccionadas`;

  return (
    <div className="flex flex-wrap gap-3 items-end">
      {/* Periodo base */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Periodo base</label>
        <select
          value={basePeriod}
          onChange={(e) => {
            const v = e.target.value;
            setBasePeriod(v);
            applyWith({ basePeriod: v });
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
        >
          {BASE_PERIODS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {/* Margen % */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Margen variación</label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            max="50"
            step="1"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            onBlur={(e) => applyWith({ margin: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyWith({ margin: (e.target as HTMLInputElement).value });
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white w-20 text-right"
          />
          <span className="text-sm text-gray-500 font-medium">%</span>
        </div>
      </div>

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
