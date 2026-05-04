import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { VerificationRow, type SerializedVerification, type AvailableInvoice } from "./verification-row";
import { NewVerificationForm } from "./new-verification-form";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupplierDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      verifications: {
        orderBy: { periodStart: "desc" },
        include: {
          invoice: {
            select: { number: true, counterparty: true, totalEur: true },
          },
        },
      },
    },
  });

  if (!supplier) notFound();

  const availableInvoicesRaw = supplier.name
    ? await prisma.invoice.findMany({
        where: {
          type: "PURCHASE",
          counterparty: { contains: supplier.name, mode: "insensitive" },
        },
        orderBy: { date: "desc" },
        take: 50,
        select: { id: true, number: true, counterparty: true, totalEur: true, date: true },
      })
    : [];

  const availableInvoices: AvailableInvoice[] = availableInvoicesRaw.map((inv) => ({
    id: inv.id,
    number: inv.number,
    counterparty: inv.counterparty,
    totalEur: Number(inv.totalEur),
    date: inv.date.toISOString(),
  }));

  const verifications: SerializedVerification[] = supplier.verifications.map((v) => ({
    id: v.id,
    supplierId: v.supplierId,
    periodStart: v.periodStart.toISOString(),
    periodEnd: v.periodEnd.toISOString(),
    tempoHours: v.tempoHours,
    expectedAmount: v.expectedAmount,
    capturedAt: v.capturedAt?.toISOString() ?? null,
    invoiceId: v.invoiceId,
    invoicedAmount: v.invoicedAmount,
    invoiceServicePeriodStart: v.invoiceServicePeriodStart?.toISOString() ?? null,
    invoiceServicePeriodEnd: v.invoiceServicePeriodEnd?.toISOString() ?? null,
    periodMismatch: v.periodMismatch,
    status: v.status,
    verifiedAt: v.verifiedAt?.toISOString() ?? null,
    verifiedBy: v.verifiedBy,
    notes: v.notes,
    invoice: v.invoice
      ? { number: v.invoice.number, counterparty: v.invoice.counterparty, totalEur: Number(v.invoice.totalEur) }
      : null,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/suppliers" className="text-xs text-indigo-600 hover:text-indigo-800 mb-2 inline-block">
          ← Proveedores
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{supplier.name}</h1>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span>
                Tarifa: {supplier.hourlyRate != null ? `${supplier.hourlyRate.toFixed(2)} €/h` : <span className="text-gray-400">no configurada</span>}
              </span>
              <span>
                Jira ID: {supplier.jiraAccountId ?? <span className="text-gray-400 font-mono">—</span>}
              </span>
            </div>
          </div>
          <NewVerificationForm supplierId={supplier.id} />
        </div>
      </div>

      {/* Tabla de verificaciones */}
      {verifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm text-gray-500">No hay períodos de verificación. Crea uno con el botón &quot;Nuevo período&quot;.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          {/* Cabecera de la tabla */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_1fr_1fr_1fr_2fr] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <span>Período</span>
            <span className="text-right">Horas Tempo</span>
            <span className="text-right">Esperado</span>
            <span>Factura</span>
            <span>Período declarado</span>
            <span className="text-right">Facturado</span>
            <span className="text-right">Diferencia</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>

          {verifications.map((v) => (
            <VerificationRow
              key={v.id}
              verification={v}
              availableInvoices={availableInvoices}
            />
          ))}
        </div>
      )}
    </div>
  );
}
