"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { type VerificationStatus, type SupplierTipo } from "@prisma/client";
import { SupplierTipoSelect } from "./supplier-tipo-select";
import { RolesSection } from "./[id]/roles-section";
import { JiraUserList, type JiraUserEntry } from "./[id]/jira-user-list";
import { JiraUserChip } from "./jira-user-chip";
import { SortThClick } from "@/components/sort-th";

type SupplierSortKey = "name" | "companyName";

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
  jiraUsers: JiraUserEntry[];
  defaultRoleId: string | null;
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

// ─── Drawer ───────────────────────────────────────────────────────────────────

function SupplierDrawer({
  supplier,
  roleTemplates,
  workspaceId,
  onClose,
}: {
  supplier: SupplierRow | null;
  roleTemplates: RoleTemplate[];
  workspaceId: string | null;
  onClose: () => void;
}): React.JSX.Element {
  const isOpen = supplier !== null;

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-1/3 min-w-80 bg-white shadow-2xl flex flex-col transform transition-transform duration-200 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}
      >
        {supplier && (
          <>
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">{supplier.name}</h2>
                  <a
                    href={`https://app.holded.com/contacts/${supplier.holdedContactId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-300 hover:text-gray-500 transition-colors"
                    title="Ver en Holded"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                    </svg>
                  </a>
                </div>
                {supplier.companyName && (
                  <p className="text-xs text-gray-400 mt-0.5">{supplier.companyName}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors ml-4 mt-0.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {/* Jira users */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Usuarios de Jira</p>
                <JiraUserList
                  supplierId={supplier.id}
                  initialUsers={supplier.jiraUsers}
                  workspaceId={workspaceId}
                />
              </div>

              {/* Roles */}
              <div>
                <RolesSection
                  supplierId={supplier.id}
                  roles={supplier.roles}
                  templates={roleTemplates}
                  defaultRoleId={supplier.defaultRoleId}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 py-3 border-t border-gray-100">
              <Link
                href={`/suppliers/${supplier.id}`}
                onClick={onClose}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Ver períodos de verificación →
              </Link>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Fila de proveedor ────────────────────────────────────────────────────────

function SupplierTableRow({
  supplier,
  workspaceId,
  onOpen,
}: {
  supplier: SupplierRow;
  workspaceId: string | null;
  onOpen: (s: SupplierRow) => void;
}): React.JSX.Element {
  return (
    <tr
      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={() => onOpen(supplier)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{supplier.name}</span>
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
      <td className="px-4 py-3">
        {supplier.jiraUsers.length === 0 ? (
          <span className="text-gray-400 text-sm">—</span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {supplier.jiraUsers.map((u) => (
              <JiraUserChip key={u.accountId} accountId={u.accountId} displayName={u.displayName} workspaceId={workspaceId} />
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <SupplierTipoSelect supplierId={supplier.id} tipo={supplier.tipo} />
      </td>
      <td className="px-4 py-3">
        {supplier.lastVerification
          ? statusBadge(supplier.lastVerification.status)
          : <span className="text-xs text-gray-400">Sin períodos</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <svg
          className="w-4 h-4 text-gray-300 ml-auto"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </td>
    </tr>
  );
}

// ─── Tabla principal ──────────────────────────────────────────────────────────

interface Props {
  suppliers: SupplierRow[];
  roleTemplates?: RoleTemplate[];
  workspaceId?: string | null;
  emptyMessage?: string;
}

export function SuppliersTable({ suppliers, roleTemplates = [], workspaceId = null, emptyMessage }: Props): React.JSX.Element {
  const [activeSupplier, setActiveSupplier] = useState<SupplierRow | null>(null);
  const [sortBy, setSortBy] = useState<SupplierSortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(col: SupplierSortKey): void {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    return [...suppliers].sort((a, b) => {
      const av = (a[sortBy] ?? "").toLowerCase();
      const bv = (b[sortBy] ?? "").toLowerCase();
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [suppliers, sortBy, sortDir]);

  if (suppliers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
        <p className="text-sm text-gray-500">{emptyMessage ?? "No hay proveedores."}</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr className="text-xs uppercase tracking-wider">
              <SortThClick label="Nombre" active={sortBy === "name"} sortDir={sortDir} onClick={() => handleSort("name")} className="text-xs uppercase tracking-wider" />
              <SortThClick label="Entidad" active={sortBy === "companyName"} sortDir={sortDir} onClick={() => handleSort("companyName")} className="text-xs uppercase tracking-wider" />
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuarios Jira</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último período</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((supplier) => (
              <SupplierTableRow
                key={supplier.id}
                supplier={supplier}
                workspaceId={workspaceId}
                onOpen={setActiveSupplier}
              />
            ))}
          </tbody>
        </table>
      </div>

      <SupplierDrawer
        supplier={activeSupplier}
        roleTemplates={roleTemplates}
        workspaceId={workspaceId}
        onClose={() => setActiveSupplier(null)}
      />
    </>
  );
}
