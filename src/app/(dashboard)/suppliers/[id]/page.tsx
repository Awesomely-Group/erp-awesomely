import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { JiraClient } from "@/lib/jira";
import { VerificationRow, type SerializedVerification, type AvailableInvoice } from "./verification-row";
import { NewVerificationForm } from "./new-verification-form";
import { RolesSection } from "./roles-section";
import { JiraUserPicker } from "./jira-user-picker";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SupplierDetailPage({ params }: Props): Promise<React.JSX.Element> {
  const { id } = await params;

  const [supplier, roleTemplatesRaw, firstWorkspace] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id },
      include: {
        roles: {
          where: { active: true },
          orderBy: { name: "asc" },
        },
        verifications: {
          orderBy: { periodStart: "desc" },
          include: {
            invoice: {
              select: { number: true, counterparty: true, totalEur: true },
            },
            role: {
              select: { name: true, ratePerHour: true },
            },
          },
        },
      },
    }),
    prisma.roleTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.jiraWorkspace.findFirst({ where: { active: true }, select: { id: true, domain: true, email: true, apiToken: true } }),
  ]);

  if (!supplier) notFound();

  const roleTemplates = roleTemplatesRaw.map((t) => ({ id: t.id, name: t.name, color: t.color }));

  let jiraDisplayName: string | null = null;
  if (supplier.jiraAccountId && firstWorkspace) {
    const jira = new JiraClient(firstWorkspace.domain, firstWorkspace.email, firstWorkspace.apiToken);
    const names = await jira.getUsersByAccountIds([supplier.jiraAccountId]);
    const resolved = names.get(supplier.jiraAccountId);
    jiraDisplayName = resolved !== supplier.jiraAccountId ? (resolved ?? null) : null;
  }

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
    expectedAmount: v.expectedAmount != null ? Number(v.expectedAmount) : null,
    capturedAt: v.capturedAt?.toISOString() ?? null,
    invoiceId: v.invoiceId,
    invoicedAmount: v.invoicedAmount != null ? Number(v.invoicedAmount) : null,
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
    role: v.role
      ? { name: v.role.name, ratePerHour: Number(v.role.ratePerHour) }
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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">{supplier.name}</h1>
              <a
                href={`https://app.holded.com/contacts/${supplier.holdedContactId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5"
                title="Ver en Holded"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z" />
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z" />
                </svg>
              </a>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
              <span>
                Tarifa: {supplier.hourlyRate != null ? `${supplier.hourlyRate.toFixed(2)} €/h` : <span className="text-gray-400">no configurada</span>}
              </span>
              <JiraUserPicker
                supplierId={supplier.id}
                currentAccountId={supplier.jiraAccountId}
                currentDisplayName={jiraDisplayName}
                workspaceId={firstWorkspace?.id ?? null}
              />
            </div>
          </div>
          <NewVerificationForm supplierId={supplier.id} roles={supplier.roles.map((r) => ({ id: r.id, name: r.name, ratePerHour: Number(r.ratePerHour) }))} />
        </div>
      </div>

      <RolesSection
        supplierId={supplier.id}
        roles={supplier.roles.map((r) => ({ id: r.id, name: r.name, ratePerHour: Number(r.ratePerHour) }))}
        templates={roleTemplates}
      />

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
