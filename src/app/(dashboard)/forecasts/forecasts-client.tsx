"use client";

import { useState } from "react";
import { ForecastType } from "@prisma/client";
import { Plus } from "lucide-react";
import { ForecastForm } from "./forecast-form";
import { ForecastsTable } from "./forecasts-table";
import type { AccountMappingOption, SupplierOption } from "./forecast-classification-fields";

type Project = { id: string; name: string };

type ForecastRow = {
  id: string;
  month: Date;
  type: ForecastType;
  marca: string | null;
  projectId: string | null;
  project: { id: string; name: string } | null;
  accountMappingId: string | null;
  accountMapping: { id: string; description: string; l1: string } | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  description: string | null;
  amountOptimistic: unknown;
  amountPessimistic: unknown;
  recurrenceId: string | null;
  isPaused: boolean;
};

export function ForecastsClient({
  forecasts,
  projects,
  accountMappings,
  suppliers,
}: {
  forecasts: ForecastRow[];
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
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva previsión
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <ForecastsTable
          forecasts={forecasts}
          projects={projects}
          accountMappings={accountMappings}
          suppliers={suppliers}
        />
      </div>
    </>
  );
}
