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
      activities: { orderBy: { createdAt: "desc" } },
      commissions: true,
      deals: {
        include: { stage: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!lead) notFound();

  const [users, accounts] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    prisma.crmAccount.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const detail: LeadDetail = {
    id: lead.id,
    name: lead.name,
    marca: lead.marca,
    lineOfBusiness: lead.lineOfBusiness,
    source: lead.source,
    status: lead.status,
    contactName: lead.contactName,
    email: lead.email,
    phone: lead.phone,
    estimatedAmount: lead.estimatedAmount !== null ? Number(lead.estimatedAmount) : null,
    notes: lead.notes,
    disqualifiedReason: lead.disqualifiedReason,
    origin: lead.origin,
    market: lead.market,
    seats: lead.seats,
    campaignSource: lead.campaignSource,
    utmSource: lead.utmSource,
    utmCampaign: lead.utmCampaign,
    ownerId: lead.ownerId,
    accountId: lead.accountId,
    accountName: lead.account?.name ?? null,
    createdAt: lead.createdAt.toISOString(),
    convertedAt: lead.convertedAt?.toISOString() ?? null,
    deals: lead.deals.map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.amount !== null ? Number(d.amount) : null,
      stageName: d.stage.name,
    })),
    activities: lead.activities.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      notes: a.notes,
      dueDate: a.dueDate?.toISOString() ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
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
      users={users.map((u) => ({ id: u.id, label: u.name ?? u.email }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
