import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { type VerificationStatus, type SupplierTipo, Prisma } from "@prisma/client";
import { SuppliersFilters } from "./suppliers-filters";
import { SupplierTipoSelect } from "./supplier-tipo-select";

interface Props {
  searchParams: Promise<{ search?: string; tipo?: string }>;
}

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
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}>{label}</span>;
}

const TIPO_VALUES: SupplierTipo[] = ["SERVICIOS", "HERRAMIENTAS"];

function isTipo(v: string): v is SupplierTipo {
  return (TIPO_VALUES as string[]).includes(v);
}

export default async function SuppliersPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const { search, tipo } = await searchParams;

  const where: Prisma.SupplierWhereInput = {
    active: true,
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    ...(tipo && isTipo(tipo) ? { tipo } : {}),
  };

  const suppliers = await prisma.supplier.findMany({
    where,
    include: {
      verifications: {
        orderBy: { periodEnd: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Proveedores</h1>
        <p className="text-sm text-gray-500 mt-1">
          Sincronizados desde Holded.
        </p>
      </div>

      <div className="mb-4">
        <SuppliersFilters />
      </div>

      {suppliers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm text-gray-500">
            {search ?? tipo
              ? "No hay proveedores que coincidan con los filtros."
              : "No hay proveedores. Se sincronizan automáticamente desde los contactos de tipo proveedor en Holded."}
          </p>
          {!(search ?? tipo) && (
            <p className="text-xs text-gray-400 mt-1">Ejecuta una sincronización desde la sección Sincronización.</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarifa €/h</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último período</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {suppliers.map((supplier) => {
                const lastVerification = supplier.verifications[0];
                return (
                  <tr key={supplier.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/suppliers/${supplier.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-800">
                        {supplier.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <SupplierTipoSelect supplierId={supplier.id} tipo={supplier.tipo} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {supplier.hourlyRate != null ? `${supplier.hourlyRate.toFixed(2)} €` : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {lastVerification ? statusBadge(lastVerification.status) : <span className="text-xs text-gray-400">Sin períodos</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
