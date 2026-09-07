"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { buildForecastAccountsTree, type L1Group, type EntidadGroup, type MarcaGroup } from "@/lib/forecast-accounts-tree";
import type { ForecastAccountRow } from "@/lib/cashflow-data";

function PendienteCell({ value, className = "" }: { value: number; className?: string }): React.JSX.Element {
  return (
    <td className={`px-4 py-2 text-right ${value >= 0 ? "text-amber-600" : "text-green-600"} ${className}`}>
      {formatCurrency(value)}
    </td>
  );
}

function GroupRow({
  groupKey,
  depth,
  label,
  sublabel,
  estimado,
  real,
  pendiente,
  isOpen,
  onToggle,
}: {
  groupKey: string;
  depth: number;
  label: string;
  sublabel?: string;
  estimado: number;
  real: number;
  pendiente: number;
  isOpen: boolean;
  onToggle: (key: string) => void;
}): React.JSX.Element {
  const bg = depth === 0 ? "bg-gray-50" : depth === 1 ? "bg-gray-50/60" : "bg-gray-50/30";
  const textWeight = depth === 0 ? "font-semibold" : "font-medium";
  const textSize = depth === 0 ? "text-[11px] uppercase tracking-wide" : "text-xs";
  return (
    <tr className={`${bg} border-b border-gray-100`}>
      <td className="px-4 py-1.5" style={{ paddingLeft: 16 + depth * 20 }}>
        <button
          type="button"
          onClick={() => onToggle(groupKey)}
          className={`flex items-center gap-1.5 ${textWeight} ${textSize} text-gray-500 hover:text-gray-700 transition-colors`}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <span>{label}</span>
          {sublabel && <span className="font-normal normal-case text-gray-400">{sublabel}</span>}
        </button>
      </td>
      <td className={`px-4 py-1.5 text-right ${textWeight} ${textSize} text-blue-700`}>{formatCurrency(estimado)}</td>
      <td className={`px-4 py-1.5 text-right ${textWeight} ${textSize} text-gray-700`}>{formatCurrency(real)}</td>
      <PendienteCell value={pendiente} className={`${textWeight} ${textSize}`} />
    </tr>
  );
}

/**
 * Vista principal de /forecasts (E5, rediseño acordado en la revisión del
 * 2026-09-03; acordeón de 4 niveles añadido después): tabla de cuentas contables con
 * Estimado (previsión manual, escenario elegido) / Real (ya facturado, en el periodo
 * filtrado) / Pendiente (Estimado − Real), agrupada en cascada por Grupo de cuenta
 * (`l1`, mismo orden que el resto de la app) → Entidad legal → Marca → Cuenta, cada
 * nivel colapsable de forma independiente. Empieza todo expandido para no perder
 * visibilidad respecto a la versión anterior (agrupación solo por `l1`).
 */
export function ForecastAccountsTable({
  rows,
  scenarioLabel,
}: {
  rows: ForecastAccountRow[];
  scenarioLabel: string;
}): React.JSX.Element {
  const tree = useMemo(() => buildForecastAccountsTree(rows), [rows]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return (
      <p className="px-2 py-10 text-center text-sm text-gray-400">
        No hay previsión ni facturación real para los filtros actuales.
      </p>
    );
  }

  const toggle = (key: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const isOpen = (key: string): boolean => !collapsed.has(key);

  const totalEstimado = rows.reduce((s, r) => s + r.estimado, 0);
  const totalReal = rows.reduce((s, r) => s + r.real, 0);
  const totalPendiente = totalEstimado - totalReal;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Cuenta</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
              Estimado <span className="font-normal normal-case text-gray-400">({scenarioLabel})</span>
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Real</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Pendiente</th>
          </tr>
        </thead>
        <tbody>
          {tree.map((l1Group: L1Group) => (
            <RenderL1 key={l1Group.key} group={l1Group} isOpen={isOpen} onToggle={toggle} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 font-semibold">
            <td className="px-4 py-3 text-gray-800">Total</td>
            <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(totalEstimado)}</td>
            <td className="px-4 py-3 text-right text-gray-800">{formatCurrency(totalReal)}</td>
            <td className={`px-4 py-3 text-right ${totalPendiente >= 0 ? "text-amber-600" : "text-green-600"}`}>
              {formatCurrency(totalPendiente)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function RenderL1({
  group,
  isOpen,
  onToggle,
}: {
  group: L1Group;
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
}): React.JSX.Element {
  const open = isOpen(group.key);
  return (
    <>
      <GroupRow
        groupKey={group.key}
        depth={0}
        label={group.label}
        estimado={group.estimado}
        real={group.real}
        pendiente={group.pendiente}
        isOpen={open}
        onToggle={onToggle}
      />
      {open &&
        group.entidades.map((entidadGroup) => (
          <RenderEntidad key={entidadGroup.key} group={entidadGroup} isOpen={isOpen} onToggle={onToggle} />
        ))}
    </>
  );
}

function RenderEntidad({
  group,
  isOpen,
  onToggle,
}: {
  group: EntidadGroup;
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
}): React.JSX.Element {
  const open = isOpen(group.key);
  return (
    <>
      <GroupRow
        groupKey={group.key}
        depth={1}
        label={group.companyName}
        estimado={group.estimado}
        real={group.real}
        pendiente={group.pendiente}
        isOpen={open}
        onToggle={onToggle}
      />
      {open &&
        group.marcas.map((marcaGroup) => (
          <RenderMarca key={marcaGroup.key} group={marcaGroup} isOpen={isOpen} onToggle={onToggle} />
        ))}
    </>
  );
}

function RenderMarca({
  group,
  isOpen,
  onToggle,
}: {
  group: MarcaGroup;
  isOpen: (key: string) => boolean;
  onToggle: (key: string) => void;
}): React.JSX.Element {
  const open = isOpen(group.key);
  return (
    <>
      <GroupRow
        groupKey={group.key}
        depth={2}
        label={group.marca}
        estimado={group.estimado}
        real={group.real}
        pendiente={group.pendiente}
        isOpen={open}
        onToggle={onToggle}
      />
      {open &&
        group.cuentas.map((leaf) => (
          <tr
            key={leaf.key}
            className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
          >
            <td className="px-4 py-2.5 text-gray-800 max-w-[320px] truncate" style={{ paddingLeft: 16 + 3 * 20 }}>
              {leaf.label}
            </td>
            <td className="px-4 py-2.5 text-right font-medium text-blue-700">{formatCurrency(leaf.estimado)}</td>
            <td className="px-4 py-2.5 text-right font-medium text-gray-700">{formatCurrency(leaf.real)}</td>
            <PendienteCell value={leaf.pendiente} className="font-medium" />
          </tr>
        ))}
    </>
  );
}
