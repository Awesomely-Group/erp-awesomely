import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const account = await prisma.crmAccount.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true, email: true } },
      contacts: true,
      leads: { include: { stage: true }, orderBy: { createdAt: "desc" } },
      company: { select: { name: true } },
    },
  });
  if (!account) notFound();

  // Ficha 360 (F5): resuelve proformas/facturas por (companyId, holdedContactId) —
  // solo disponible una vez la cuenta tiene contacto fiscal (D3: se crea al preparar
  // la primera propuesta, no antes).
  const [proformas, invoices] = account.companyId && account.holdedContactId
    ? await Promise.all([
        prisma.proforma.findMany({
          where: { companyId: account.companyId, holdedContactId: account.holdedContactId },
          orderBy: { date: "desc" },
          take: 20,
        }),
        prisma.invoice.findMany({
          where: { companyId: account.companyId, holdedContactId: account.holdedContactId },
          orderBy: { date: "desc" },
          take: 20,
        }),
      ])
    : [[], []];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm/cuentas" className="text-xs text-gray-400 hover:text-gray-600">
          ← Volver a cuentas
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">{account.name}</h1>
        <p className="text-sm text-gray-500">
          {account.marca ?? "Sin marca"} · {account.lifecycle}
          {account.company && ` · ${account.company.name}`}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Contactos</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {account.contacts.map((c) => (
              <li key={c.id} className="flex justify-between">
                <span className="text-gray-900">{c.name}</span>
                <span className="text-gray-500">{c.email ?? c.phone ?? "—"}</span>
              </li>
            ))}
            {account.contacts.length === 0 && (
              <li className="text-xs text-gray-400">Sin contactos todavía.</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Leads</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {account.leads.map((l) => (
              <li key={l.id} className="flex justify-between">
                <Link href={`/crm/leads/${l.id}`} className="text-indigo-600 hover:text-indigo-800">
                  {l.name}
                </Link>
                <span className="text-gray-500">{l.stage.name}</span>
              </li>
            ))}
            {account.leads.length === 0 && (
              <li className="text-xs text-gray-400">Sin leads todavía.</li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Proformas</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {proformas.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span className="text-gray-900">{p.number ?? p.holdedId}</span>
                <span className="text-gray-500">
                  {formatCurrency(Number(p.totalEur))} · {formatDate(p.date)}
                </span>
              </li>
            ))}
            {proformas.length === 0 && (
              <li className="text-xs text-gray-400">
                {account.holdedContactId ? "Sin proformas todavía." : "Sin contacto fiscal en Holded todavía."}
              </li>
            )}
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Facturas</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {invoices.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span className="text-gray-900">{i.number ?? i.holdedId}</span>
                <span className="text-gray-500">
                  {formatCurrency(Number(i.totalEur))} · {formatDate(i.date)}
                </span>
              </li>
            ))}
            {invoices.length === 0 && (
              <li className="text-xs text-gray-400">
                {account.holdedContactId ? "Sin facturas todavía." : "Sin contacto fiscal en Holded todavía."}
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
