import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";
import { describeRelation, leadStatusLabel } from "@/lib/crm-relations";
import {
  AccountClassificationCard,
  AccountRelationsCard,
  type RelationRow,
} from "./account-links";

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
      deals: { include: { stage: true }, orderBy: { createdAt: "desc" } },
      leads: { orderBy: { createdAt: "desc" } },
      company: { select: { name: true } },
      referredBy: { select: { id: true, name: true } },
      referrals: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      relationsFrom: { include: { toAccount: { select: { id: true, name: true } } } },
      relationsTo: { include: { fromAccount: { select: { id: true, name: true } } } },
    },
  });
  if (!account) notFound();

  // La relación se guarda una sola vez, así que esta ficha es el lado saliente de unas y
  // el entrante de otras. Se normalizan a una lista única ya leída desde aquí.
  const relations: RelationRow[] = [
    ...account.relationsFrom.map((r) => ({
      id: r.id,
      label: describeRelation(r.type, "outgoing"),
      otherId: r.toAccount.id,
      otherName: r.toAccount.name,
      note: r.note,
    })),
    ...account.relationsTo.map((r) => ({
      id: r.id,
      label: describeRelation(r.type, "incoming"),
      otherId: r.fromAccount.id,
      otherName: r.fromAccount.name,
      note: r.note,
    })),
  ].sort((a, b) => a.otherName.localeCompare(b.otherName));

  const abiertas = account.deals.filter((d) => !d.stage.isWon && !d.stage.isLost);

  const [accountOptions, partnerOptions] = await Promise.all([
    prisma.crmAccount.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.crmAccount.findMany({
      where: { type: "PARTNER" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

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
          {account.referredBy && (
            <>
              {" · vía "}
              <Link
                href={`/crm/cuentas/${account.referredBy.id}`}
                className="text-indigo-600 hover:text-indigo-800"
              >
                {account.referredBy.name}
              </Link>
            </>
          )}
        </p>
        {account.type === "PARTNER" && (
          <p className="mt-1 inline-block rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            Partner / prescriptor
            {account.referrals.length > 0 && ` · ha traído ${account.referrals.length} cuenta${account.referrals.length === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <AccountClassificationCard
          accountId={account.id}
          type={account.type}
          referredBy={account.referredBy}
          partners={partnerOptions}
        />

        <AccountRelationsCard
          accountId={account.id}
          relations={relations}
          accounts={accountOptions}
        />

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
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Oportunidades</h2>
            {abiertas.length > 0 && (
              <span className="text-xs text-gray-400">
                {abiertas.length} abierta{abiertas.length === 1 ? "" : "s"} ·{" "}
                {formatCurrency(abiertas.reduce((sum, d) => sum + (d.amount !== null ? Number(d.amount) : 0), 0))}
              </span>
            )}
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {account.deals.map((d) => {
              const cerrada = d.stage.isWon || d.stage.isLost;
              return (
                <li key={d.id} className="flex justify-between gap-2">
                  <Link
                    href={`/crm/deals/${d.id}`}
                    className={
                      cerrada
                        ? "min-w-0 truncate text-gray-400 hover:text-gray-600"
                        : "min-w-0 truncate text-indigo-600 hover:text-indigo-800"
                    }
                  >
                    {d.name}
                  </Link>
                  <span className="shrink-0 text-gray-500">
                    {d.stage.name}
                    {d.amount !== null && ` · ${formatCurrency(Number(d.amount))}`}
                  </span>
                </li>
              );
            })}
            {account.deals.length === 0 && (
              <li className="text-xs text-gray-400">Sin oportunidades todavía.</li>
            )}
          </ul>
        </div>

        {/* Los leads sin cualificar de esta cuenta. Normalmente no hay ninguno: un lead
            se enlaza a la cuenta al cualificarlo, y ahí ya pasa a tener oportunidad. */}
        {account.leads.some((l) => l.status !== "QUALIFIED") && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Leads sin cualificar</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {account.leads
                .filter((l) => l.status !== "QUALIFIED")
                .map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <Link
                      href={`/crm/leads/${l.id}`}
                      className="min-w-0 truncate text-indigo-600 hover:text-indigo-800"
                    >
                      {l.name}
                    </Link>
                    <span className="shrink-0 text-gray-500">{leadStatusLabel(l.status)}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

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
