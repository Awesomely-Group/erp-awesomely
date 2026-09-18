import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LeadDetailView } from "./lead-detail-view";
import type { LeadDetail } from "./lead-detail-view";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const lead = await prisma.crmLead.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      account: { select: { id: true, name: true } },
      stage: true,
      activities: { orderBy: { createdAt: "desc" } },
      budgets: { select: { id: true, name: true, amount: true, status: true, documensoStatus: true } },
      commissions: true,
    },
  });
  if (!lead) notFound();

  const [stages, users] = await Promise.all([
    prisma.crmStage.findMany({ where: { marca: lead.marca }, orderBy: { order: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  const detail: LeadDetail = {
    id: lead.id,
    name: lead.name,
    marca: lead.marca,
    source: lead.source,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    amount: lead.amount !== null ? Number(lead.amount) : null,
    notes: lead.notes,
    qualified: lead.qualified,
    stageId: lead.stageId,
    stageName: lead.stage.name,
    ownerId: lead.ownerId,
    ownerLabel: lead.owner ? (lead.owner.name ?? lead.owner.email) : null,
    accountId: lead.accountId,
    accountName: lead.account?.name ?? null,
    createdAt: lead.createdAt.toISOString(),
    activities: lead.activities.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      notes: a.notes,
      dueDate: a.dueDate?.toISOString() ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
    })),
    budgets: lead.budgets.map((b) => ({
      id: b.id,
      name: b.name,
      amount: Number(b.amount),
      status: b.status,
      documensoStatus: b.documensoStatus,
    })),
    commissions: lead.commissions.map((c) => ({
      id: c.id,
      type: c.type,
      amount: Number(c.amount),
      status: c.status,
    })),
  };

  return (
    <LeadDetailView
      lead={detail}
      stages={stages.map((s) => ({ id: s.id, name: s.name, order: s.order }))}
      users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
    />
  );
}
