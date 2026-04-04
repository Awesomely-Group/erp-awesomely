"use client";

import { useEffect, useState, useTransition } from "react";
import type { Empresa, Marca } from "@prisma/client";
import { EMPRESA_OPTIONS, MARCA_OPTIONS } from "@/lib/org";
import { updateCompanyOrg } from "./actions";

interface Props {
  companyId: string;
  empresa: Empresa | null;
  marca: Marca | null;
}

export function CompanyOrgPicker({
  companyId,
  empresa: empresaProp,
  marca: marcaProp,
}: Props): React.JSX.Element {
  const [empresa, setEmpresa] = useState(empresaProp ?? "");
  const [marca, setMarca] = useState(marcaProp ?? "");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setEmpresa(empresaProp ?? "");
    setMarca(marcaProp ?? "");
  }, [companyId, empresaProp, marcaProp]);

  function persist(next: { empresa?: string; marca?: string }): void {
    const e = next.empresa !== undefined ? next.empresa : empresa;
    const m = next.marca !== undefined ? next.marca : marca;
    startTransition(async () => {
      await updateCompanyOrg(companyId, {
        empresa: e || null,
        marca: m || null,
      });
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1 min-w-[12rem]">
        <label className="text-xs text-gray-500 font-medium">Empresa</label>
        <select
          disabled={pending}
          value={empresa}
          onChange={(ev) => {
            const v = ev.target.value;
            setEmpresa(v);
            persist({ empresa: v });
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:opacity-50"
        >
          <option value="">Sin asignar</option>
          {EMPRESA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 min-w-[12rem]">
        <label className="text-xs text-gray-500 font-medium">Marca</label>
        <select
          disabled={pending}
          value={marca}
          onChange={(ev) => {
            const v = ev.target.value;
            setMarca(v);
            persist({ marca: v });
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white disabled:opacity-50"
        >
          <option value="">Sin asignar</option>
          {MARCA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
