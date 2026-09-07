"use client";

import { Info } from "lucide-react";

/**
 * Icono de ayuda con tooltip accesible al pasar el ratón (o al hacer foco con teclado).
 * Nace de la petición de la reunión de revisión del 2026-09-03 (E8): explicar en los
 * KPIs de /forecasts exactamente qué incluye cada cifra, con textos verificados contra
 * el cálculo real (ver `src/lib/cashflow-data.ts`), no contra lo que se dijo de memoria
 * en la reunión.
 */
export function InfoTooltip({ text }: { text: string }): React.JSX.Element {
  return (
    <span className="relative inline-flex group ml-1 align-middle">
      <button
        type="button"
        tabIndex={0}
        className="text-gray-300 hover:text-gray-500 focus:text-gray-500 transition-colors"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-30 mb-2 w-64 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal normal-case leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
