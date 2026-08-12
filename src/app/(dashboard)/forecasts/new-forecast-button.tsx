"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ForecastForm } from "./forecast-form";
import type { AccountMappingOption, SupplierOption } from "./forecast-classification-fields";

type Project = { id: string; name: string };

/** Botón "Nueva previsión" independiente de la tabla — usado en la cabecera del dashboard. */
export function NewForecastButton({
  projects,
  accountMappings,
  suppliers,
}: {
  projects: Project[];
  accountMappings: AccountMappingOption[];
  suppliers: SupplierOption[];
}): React.JSX.Element {
  const [creating, setCreating] = useState(false);

  return (
    <>
      {creating && (
        <ForecastForm
          projects={projects}
          accountMappings={accountMappings}
          suppliers={suppliers}
          onClose={() => setCreating(false)}
        />
      )}
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Nueva previsión
      </button>
    </>
  );
}
