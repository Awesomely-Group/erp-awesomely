"use client";

import { useState } from "react";
import Link from "next/link";
import { type VerificationStatus, type SupplierTipo } from "@prisma/client";
import { SupplierTipoSelect } from "./supplier-tipo-select";
import { RolesSection } from "./[id]/roles-section";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SupplierRole {
  id: string;
  name: string;
  ratePerHour: number;
}

export interface RoleTemplate {
  id: string;
  name: string;
  color: string;
}

export interface SupplierRow {
  id: string;
  name: string | null;
  holdedContactId: string;
  companyName: string | null;
  tipo: SupplierTipo | null;
  lastVerification: { status: VerificationStatus } | null;
  roles: SupplierRole[];
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function statusBadge(status: VerificationStatus): React.JSX.Element {
  const configs: Record<VerificationStatus, { label: string; className: string }> = {
    PENDING: { label: "Pendiente", className: "bg-gray-100 text-gray-700" },
    HOURS_CAPTURED: { label: "Horas capturadas", className: "bg-blue-100 text-blue-700" },
    INVOICE_RECEIVED: { label: "Factura recibida", className: "bg-yellow-100 text-yellow-700" },
    PERIOD_MISMATCH: { label: "Período incorrecto", className: "bg-red-100 text-red-700" },
    VERIFIED_MISMATCH: { label: "Importe incorrecto", className: "bg-orange-100 text-orange-700" },
    VERIFIED_OK: { label: "Verificado OK", className: "bg-green-100 text-green-700" },
    APPROVED: { label: "Aprobado", className: "bg-green-600 text-white" },
  };
  const { label, className } = configs[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// ─── Fila expandida ───────────────────────────────────────────────────────────

function ExpandedSupplierRow({
  supplierId,
  roles,
  roleTemplates,
}: {
  supplierId: string;
  roles: SupplierRole[];
  roleTemplates: RoleTemplate[];
}): React.JSX.Element {
  return (
    <tr className="bg-indigo-50/40 border-b border-gray-100">
      <td colSpan={5} className="px-6 py-4">
        <RolesSection supplierId={supplierId} roles={roles} templates={roleTemplates} />
      </td>
    </tr>
  );
}

// ─── Fila de proveedor ────────────────────────────────────────────────────────

interface SupplierTableRowProps {
  supplier: SupplierRow;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  roleTemplates: RoleTemplate[];
}

function SupplierTableRow({
  supplier,
  isExpanded,
  onToggleExpand,
  roleTemplates,
}: SupplierTableRowProps): React.JSX.Element {
  return (
    <>
      <tr
        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => onToggleExpand(supplier.id)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Link
              href={`/suppliers/${supplier.id}`}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
              onClick={(e) => e.stopPropagation()}
            >
              {supplier.name}
            </Link>
            <a
              href={`https://app.holded.com/contacts/${supplier.holdedContactId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-300 hover:text-gray-500 shrink-0"
              title="Ver en Holded"
              onClick={(e) => e.stopPropagation()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
              </svg>
            </a>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-gray-700">
          {supplier.companyName ?? <span className="text-gray-400">—</span>}
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <SupplierTipoSelect supplierId={supplier.id} tipo={supplier.tipo} />
        </td>
        <td className="px-4 py-3">
          {supplier.lastVerification
            ? statusBadge(supplier.lastVerification.status)
            : <span className="text-xs text-gray-400">Sin períodos</span>}
        </td>
        <td className="px-4 py-3">
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </td>
      </tr>

      {isExpanded && (
        <ExpandedSupplierRow supplierId={supplier.id} roles={supplier.roles} roleTemplates={roleTemplates} />
      )}
    </>
  );
}

// ─── Tabla principal ──────────────────────────────────────────────────────────

interface Props {
  suppliers: SupplierRow[];
  roleTemplates?: RoleTemplate[];
  emptyMessage?: string;
}

export function SuppliersTable({ suppliers, roleTemplates = [], emptyMessage }: Props): React.JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleToggle(id: string): void {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (suppliers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
        <p className="text-sm text-gray-500">{emptyMessage ?? "No hay proveedores."}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-100">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entidad</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último período</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {suppliers.map((supplier) => (
            <SupplierTableRow
              key={supplier.id}
              supplier={supplier}
              isExpanded={expandedId === supplier.id}
              onToggleExpand={handleToggle}
              roleTemplates={roleTemplates}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
