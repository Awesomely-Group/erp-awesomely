"use client";

import React from "react";
import { formatCurrency } from "@/lib/utils";

interface Props {
  fixedPrice: number | null;
  budgetedHours: number | null;
  totalCost: number;
  totalHours: number;
}

function ProgressBar({ value, max, danger }: { value: number; max: number; danger?: boolean }): React.JSX.Element {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = danger
    ? pct >= 100 ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-green-500"
    : pct >= 100 ? "bg-red-500" : pct >= 90 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div
        className={`h-2 rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ProjectFixedPriceSection({ fixedPrice, budgetedHours, totalCost, totalHours }: Props): React.JSX.Element {
  const costPct = fixedPrice && fixedPrice > 0 ? (totalCost / fixedPrice) * 100 : null;
  const hoursPct = budgetedHours && budgetedHours > 0 ? (totalHours / budgetedHours) * 100 : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
          </svg>
          Precio cerrado
        </span>
        {costPct !== null && costPct >= 90 && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${costPct >= 100 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
            {costPct >= 100 ? "⚠ Presupuesto superado" : "⚠ Cerca del límite"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Coste */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Coste real</span>
            <span className="font-semibold text-gray-900">{formatCurrency(totalCost)}</span>
          </div>
          {fixedPrice !== null ? (
            <>
              <ProgressBar value={totalCost} max={fixedPrice} danger />
              <div className="flex justify-between text-xs text-gray-400">
                <span>Precio cerrado: {formatCurrency(fixedPrice)}</span>
                {costPct !== null && <span className={costPct >= 100 ? "text-red-600 font-medium" : ""}>{costPct.toFixed(1)}%</span>}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">Sin precio configurado</p>
          )}
        </div>

        {/* Horas */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Horas reales</span>
            <span className="font-semibold text-gray-900">{totalHours.toFixed(1)} h</span>
          </div>
          {budgetedHours !== null ? (
            <>
              <ProgressBar value={totalHours} max={budgetedHours} danger />
              <div className="flex justify-between text-xs text-gray-400">
                <span>Presupuestadas: {budgetedHours} h</span>
                {hoursPct !== null && <span className={hoursPct >= 100 ? "text-red-600 font-medium" : ""}>{hoursPct.toFixed(1)}%</span>}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">Sin horas configuradas</p>
          )}
        </div>
      </div>
    </div>
  );
}
