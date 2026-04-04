"use client";

import { useTransition } from "react";
import { updateCompanyLegalEntity } from "./actions";

interface Props {
  companyId: string;
  legalEntityId: string | null;
  entities: { id: string; name: string }[];
}

export function CompanyLegalEntityPicker({
  companyId,
  legalEntityId,
  entities,
}: Props): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1 min-w-[12rem]">
      <label className="text-xs text-gray-500 font-medium">Entidad legal</label>
      <select
        key={`${companyId}-${legalEntityId ?? ""}`}
        disabled={isPending}
        defaultValue={legalEntityId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          startTransition(async () => {
            await updateCompanyLegalEntity(companyId, v || null);
          });
        }}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:opacity-50"
      >
        <option value="">Sin asignar</option>
        {entities.map((ent) => (
          <option key={ent.id} value={ent.id}>
            {ent.name}
          </option>
        ))}
      </select>
    </div>
  );
}
