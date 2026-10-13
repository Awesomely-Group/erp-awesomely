import { prisma } from "@/lib/prisma";
import { MARCA_OPTIONS } from "@/lib/org";
import { CrmBoard } from "./crm-board";
import { KpiSemaforo } from "./kpi-semaforo";
import type { BoardAccount, BoardDeal, BoardStage, BoardUser } from "./crm-board";

/**
 * Tablero del pipeline. Desde la separación lead/deal (2026-10-13) lo que se arrastra
 * son OPORTUNIDADES, no leads: los leads sin cualificar no tienen etapa y viven en
 * /crm/leads. Lo que antes era una columna "Nuevo" llena de formularios sin filtrar
 * ensuciaba el win rate y el pipeline ponderado de los que sí eran negocio.
 */
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

  const [stages, deals, users, accounts, pendingLeads] = await Promise.all([
    prisma.crmStage.findMany({ where: { marca, lineOfBusiness }, orderBy: { order: "asc" } }),
    prisma.crmDeal.findMany({
      where: { marca, lineOfBusiness },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        account: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    // Sin filtrar por marca: una cuenta puede comprar a varias marcas del grupo, y la
    // suya propia es solo de dónde vino la primera vez.
    prisma.crmAccount.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.crmLead.count({ where: { marca, status: { in: ["NEW", "CONTACTED"] } } }),
  ]);

  const boardStages: BoardStage[] = stages.map((s) => ({
    id: s.id,
    name: s.name,
    order: s.order,
    isWon: s.isWon,
    isLost: s.isLost,
  }));

  const boardDeals: BoardDeal[] = deals.map((d) => ({
    id: d.id,
    name: d.name,
    accountId: d.accountId,
    accountName: d.account.name,
    amount: d.amount !== null ? Number(d.amount) : null,
    stageId: d.stageId,
    dealType: d.dealType,
    ownerName: d.owner?.name ?? d.owner?.email ?? null,
  }));

  const boardUsers: BoardUser[] = users.map((u) => ({
    id: u.id,
    label: u.name ?? u.email,
  }));

  const boardAccounts: BoardAccount[] = accounts.map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="space-y-4">
      <KpiSemaforo marca={marca} lineOfBusiness={lineOfBusiness} />
      <CrmBoard
        marca={marca}
        lineOfBusiness={lineOfBusiness}
        availableLines={lineValues}
        stages={boardStages}
        deals={boardDeals}
        users={boardUsers}
        accounts={boardAccounts}
        pendingLeads={pendingLeads}
      />
    </div>
  );
}
