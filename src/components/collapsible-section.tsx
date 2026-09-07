"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * Sección plegable genérica, cerrada por defecto salvo que `defaultOpen` diga lo
 * contrario. Nace de E5 (rediseño de /forecasts, revisión 2026-09-03): el gráfico
 * mensual y el detalle de documentos pasan a ser una vista secundaria, no lo primero
 * que se ve al entrar a Previsiones.
 */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-6 py-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        {title}
      </button>
      {open && <div className="border-t border-gray-100 p-6 pt-4">{children}</div>}
    </div>
  );
}
