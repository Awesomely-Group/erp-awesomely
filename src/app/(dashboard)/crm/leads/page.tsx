import { prisma } from "@/lib/prisma";
import { MARCA_OPTIONS } from "@/lib/org";
import { LeadsView } from "./leads-view";
import type { LeadRow, LeadsUser } from "./leads-view";
import type { Prisma } from "@prisma/client";

/**
 * Cola de leads sin cualificar. Separada del tablero desde el 2026-10-13: un lead no
 * tiene etapa, así que no cabe en el embudo, y meterlo ahí obligaba a inventar una
 * columna "Nuevo" que lo único que hacía era hundir el win rate.
 */
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ marca?: string; estado?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const marca = params.marca && MARCA_OPTIONS.some((m) => m.value === params.marca)
    ? params.marca
    : MARCA_OPTIONS[0].value;

  // Por defecto solo lo que hay que atender: cualificados y descartados ya están
  // resueltos y lo único que harían es tapar la cola de trabajo real.
  const filtro = params.estado ?? "abiertos";
  const statusWhere: Prisma.CrmLeadWhereInput =
    filtro === "todos"
      ? {}
      : filtro === "QUALIFIED" || filtro === "DISQUALIFIED"
        ? { status: filtro }
        : { status: { in: ["NEW", "CONTACTED"] } };

  const [leads, users] = await Promise.all([
    prisma.crmLead.findMany({
      where: { marca, ...statusWhere },
      include: {
        owner: { select: { name: true, email: true } },
        account: { select: { name: true } },
        _count: { select: { deals: true } },
      },
      // Los más antiguos sin atender primero: un lead de hace tres semanas en NEW es
      // más urgente que el que entró esta mañana.
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    prisma.user.findMany({ select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  const rows: LeadRow[] = leads.map((l) => ({
    id: l.id,
    name: l.name,
    contactName: l.contactName,
    email: l.email,
    phone: l.phone,
    status: l.status,
    source: l.source,
    estimatedAmount: l.estimatedAmount !== null ? Number(l.estimatedAmount) : null,
    ownerName: l.owner?.name ?? l.owner?.email ?? null,
    accountName: l.account?.name ?? null,
    createdAt: l.createdAt.toISOString(),
    dealCount: l._count.deals,
  }));

  const viewUsers: LeadsUser[] = users.map((u) => ({ id: u.id, label: u.name ?? u.email }));

  return <LeadsView marca={marca} filtro={filtro} leads={rows} users={viewUsers} />;
}
