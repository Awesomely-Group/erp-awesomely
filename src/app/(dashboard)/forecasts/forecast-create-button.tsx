"use client";

import { useRef, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import { ForecastForm, type Mode } from "./forecast-form";
import type { AccountMappingOption, SupplierOption } from "./forecast-classification-fields";

type Project = { id: string; name: string };

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "oneshot", label: "OneShot" },
  { value: "recurrence", label: "Recurrente" },
];

/**
 * Botón "Nueva previsión" con el mismo patrón que "Nuevo presupuesto" en /budgets:
 * un botón con chevron que, al pasar el ratón por encima, despliega un dropdown con
 * las opciones (aquí OneShot/Recurrente en vez de workspaces); al elegir una se abre
 * directamente el formulario en ese modo.
 */
export function ForecastCreateButton({
  projects,
  accountMappings,
  suppliers,
}: {
  projects: Project[];
  accountMappings: AccountMappingOption[];
  suppliers: SupplierOption[];
}): React.JSX.Element {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [creatingMode, setCreatingMode] = useState<Mode | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {creatingMode && (
        <ForecastForm
          projects={projects}
          accountMappings={accountMappings}
          suppliers={suppliers}
          initialMode={creatingMode}
          onClose={() => setCreatingMode(null)}
        />
      )}
      <div
        ref={dropdownRef}
        className="relative"
        onMouseEnter={() => setDropdownOpen(true)}
        onMouseLeave={() => setDropdownOpen(false)}
      >
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus className="h-4 w-4" />
          Nueva previsión
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
            {MODE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => { setCreatingMode(o.value); setDropdownOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
