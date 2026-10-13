import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DealDetailView } from "./deal-detail-view";
import type { DealDetail } from "./deal-detail-view";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const deal = await prisma.crmDeal.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      account: { select: { id: true, name: true } },
      sourceLead: { select: { id: true, name: true, source: true } },
      stage: true,
      activities: { orderBy: { createdAt: "desc" } },
      budgets: { select: { id: true, name: true, amount: true, status: true, documensoStatus: true } },
      commissions: true,
      contactRoles: {
        include: { contact: { include: { account: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!deal) notFound();

  const [stages, users, contacts, siblingDeals] = await Promise.all([
    // Solo las etapas del mismo funnel (marca + lineOfBusiness) — ver
    // CrmStage.lineOfBusiness, revisión 2026-09-18.
    prisma.crmStage.findMany({
      where: { marca: deal.marca, lineOfBusiness: deal.lineOfBusiness },
      orderBy: { order: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    // Todos los contactos, no solo los de la cuenta del deal: el asesor externo que
    // decide trabaja en otra empresa (ver CrmDecisionRole).
    prisma.crmContact.findMany({
      include: { account: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    // Las otras oportunidades abiertas de la misma cuenta. Con siete frentes vivos a la
    // vez, trabajar uno sin ver los demás lleva a llamar al mismo cliente dos veces el
    // mismo día por dos cosas distintas.
    prisma.crmDeal.findMany({
      where: { accountId: deal.accountId, id: { not: deal.id } },
      include: { stage: { select: { name: true, isWon: true, isLost: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const detail: DealDetail = {
    id: deal.id,
    name: deal.name,
    marca: deal.marca,
    lineOfBusiness: deal.lineOfBusiness,
    contactName: null,
    amount: deal.amount !== null ? Number(deal.amount) : null,
    notes: deal.notes,
    origin: deal.origin,
    market: deal.market,
    seats: deal.seats,
    dealType: deal.dealType,
    probability: deal.probability,
    expectedCloseDate: deal.expectedCloseDate?.toISOString() ?? null,
    decisionContacts: deal.contactRoles.map((r) => ({
      contactId: r.contactId,
      name: r.contact.name,
      accountName: r.contact.account.name,
      role: r.role,
    })),
    stageId: deal.stageId,
    stageName: deal.stage.name,
    ownerId: deal.ownerId,
    ownerLabel: deal.owner ? (deal.owner.name ?? deal.owner.email) : null,
    accountId: deal.accountId,
    accountName: deal.account.name,
    sourceLead: deal.sourceLead
      ? { id: deal.sourceLead.id, name: deal.sourceLead.name, source: deal.sourceLead.source }
      : null,
    createdAt: deal.createdAt.toISOString(),
    siblingDeals: siblingDeals.map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.amount !== null ? Number(d.amount) : null,
      stageName: d.stage.name,
      closed: d.stage.isWon || d.stage.isLost,
    })),
    activities: deal.activities.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      notes: a.notes,
      dueDate: a.dueDate?.toISOString() ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    budgets: deal.budgets.map((b) => ({
      id: b.id,
      name: b.name,
      amount: Number(b.amount),
      status: b.status,
      documensoStatus: b.documensoStatus,
    })),
    commissions: deal.commissions.map((c) => ({
      id: c.id,
      type: c.type,
      amount: Number(c.amount),
      status: c.status,
    })),
  };

  return (
    <DealDetailView
      deal={detail}
      stages={stages.map((s) => ({ id: s.id, name: s.name, order: s.order }))}
      users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
      contacts={contacts.map((c) => ({ id: c.id, label: `${c.name} · ${c.account.name}` }))}
    />
  );
}
