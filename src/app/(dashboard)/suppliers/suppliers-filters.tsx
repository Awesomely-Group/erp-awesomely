"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SuppliersFilters(): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const [search, setSearch] = useState(sp.get("search") ?? "");

  function applyWith(overrides: Partial<{ search: string }>): void {
    const m = { search, ...overrides };
    const params = new URLSearchParams();
    if (m.search) params.set("search", m.search);
    const tab = sp.get("tab");
    if (tab) params.set("tab", tab);
    router.push(`/suppliers?${params.toString()}`);
  }

  function reset(): void {
    setSearch("");
    const tab = sp.get("tab");
    if (tab) {
      router.push(`/suppliers?tab=${tab}`);
    } else {
      router.push("/suppliers");
    }
  }

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500 font-medium">Buscar</label>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyWith({ search: (e.target as HTMLInputElement).value })}
          onBlur={(e) => { if (e.target.value !== (sp.get("search") ?? "")) applyWith({ search: e.target.value }); }}
          placeholder="Nombre del proveedor…"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white w-56"
        />
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
