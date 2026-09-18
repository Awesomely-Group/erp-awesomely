import { prisma } from "@/lib/prisma";
import { MARCA_OPTIONS } from "@/lib/org";
import { CrmBoard } from "./crm-board";
import { KpiSemaforo } from "./kpi-semaforo";
import type { BoardLead, BoardStage, BoardUser } from "./crm-board";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string; lineOfBusiness?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const marca = params.marca && MARCA_OPTIONS.some((m) => m.value === params.marca)
    ? params.marca
    : MARCA_OPTIONS[0].value;

  // lineOfBusiness (revisión 2026-09-18, impacto plan Odoo): una marca puede tener más
  // de un funnel (Gigson Solutions: Integraciones/IA vs Odoo). Se detectan las líneas
  // realmente sembradas para esa marca y se valida el query param contra ellas.
  const availableLines = await prisma.crmStage.findMany({
    where: { marca },
    distinct: ["lineOfBusiness"],
    select: { lineOfBusiness: true },
    orderBy: { lineOfBusiness: "asc" },
  });
  const lineValues = availableLines.map((l) => l.lineOfBusiness);
  const lineOfBusiness =
    params.lineOfBusiness && lineValues.includes(params.lineOfBusiness)
      ? params.lineOfBusiness
      : (lineValues.includes("GENERAL") ? "GENERAL" : (lineValues[0] ?? "GENERAL"));

  const [stages, leads, users] = await Promise.all([
    prisma.crmStage.findMany({ where: { marca, lineOfBusiness }, orderBy: { order: "asc" } }),
    prisma.crmLead.findMany({
      where: { marca, lineOfBusiness },
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
    <div className="space-y-4">
      <KpiSemaforo marca={marca} lineOfBusiness={lineOfBusiness} />
      <CrmBoard
        marca={marca}
        lineOfBusiness={lineOfBusiness}
        availableLines={lineValues}
        stages={boardStages}
        leads={boardLeads}
        users={boardUsers}
      />
    </div>
  );
}
