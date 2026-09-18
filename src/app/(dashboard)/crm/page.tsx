import { prisma } from "@/lib/prisma";
import { MARCA_OPTIONS } from "@/lib/org";
import { CrmBoard } from "./crm-board";
import type { BoardLead, BoardStage, BoardUser } from "./crm-board";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const marca = params.marca && MARCA_OPTIONS.some((m) => m.value === params.marca)
    ? params.marca
    : MARCA_OPTIONS[0].value;

  const [stages, leads, users] = await Promise.all([
    prisma.crmStage.findMany({ where: { marca }, orderBy: { order: "asc" } }),
    prisma.crmLead.findMany({
      where: { marca },
      include: { owner: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  const boardStages: BoardStage[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    order: s.order,
    isWon: s.isWon,
    isLost: s.isLost,
  }));

  const boardLeads: BoardLead[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    contactName: l.contactName,
    amount: l.amount !== null ? Number(l.amount) : null,
    stageId: l.stageId,
    source: l.source,
    qualified: l.qualified,
    ownerName: l.owner?.name ?? l.owner?.email ?? null,
  }));

  const boardUsers: BoardUser[] = users.map((u) => ({
    id: u.id,
    label: u.name ?? u.email,
  }));

  return (
    <CrmBoard
      marca={marca}
      stages={boardStages}
      leads={boardLeads}
      users={boardUsers}
    />
  );
}
