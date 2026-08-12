"use client";

import { ForecastType } from "@prisma/client";
import { ForecastCreateButton } from "./forecast-create-button";
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
  return (
    <>
      <div className="flex justify-end">
        <ForecastCreateButton
          projects={projects}
          accountMappings={accountMappings}
          suppliers={suppliers}
        />
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
