import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { JiraClient } from "@/lib/jira";
import { TempoClient } from "@/lib/tempo";
import { SuppliersFilters } from "./suppliers-filters";
import { SuppliersTable } from "./suppliers-table";
import { SuppliersTabNav } from "./suppliers-tab-nav";

interface Props {
  searchParams: Promise<{ search?: string; tab?: string }>;
}

export default async function SuppliersPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const { search, tab } = await searchParams;

  const tabFilter: Prisma.SupplierWhereInput =
    tab === "partners" ? { isPartner: true } :
    tab === "proveedores" ? { isPartner: false } :
    {};

  const where: Prisma.SupplierWhereInput = {
    active: true,
    ...tabFilter,
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
  };

  const [suppliers, roleTemplatesRaw, firstWorkspace] = await Promise.all([
    prisma.supplier.findMany({
      where,
      include: {
        company: { select: { name: true } },
        jiraUsers: { select: { accountId: true }, orderBy: { createdAt: "asc" } },
        verifications: {
          orderBy: { periodEnd: "desc" },
          take: 1,
        },
        roles: {
          where: { active: true },
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.roleTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.jiraWorkspace.findFirst({ where: { active: true }, select: { id: true, domain: true, email: true, apiToken: true } }),
  ]);

  const roleTemplates = roleTemplatesRaw.map((t) => ({ id: t.id, name: t.name, color: t.color }));

  const allAccountIds = [...new Set(suppliers.flatMap((s) => s.jiraUsers.map((u) => u.accountId)))];
  let jiraNameMap = new Map<string, string>();
  if (allAccountIds.length > 0 && firstWorkspace) {
    const jira = new JiraClient(firstWorkspace.domain, firstWorkspace.email, firstWorkspace.apiToken);
    const tempoWorkspace = await prisma.jiraWorkspace.findFirst({ where: { active: true, tempoApiToken: { not: null } }, select: { tempoApiToken: true } });
    const tempo = tempoWorkspace?.tempoApiToken ? new TempoClient(tempoWorkspace.tempoApiToken) : undefined;
    jiraNameMap = await jira.getUsersByAccountIds(allAccountIds, tempo).catch(() => new Map());
  }

  const suppliersData = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    holdedContactId: s.holdedContactId,
    companyName: s.company?.name ?? null,
    isPartner: s.isPartner,
    jiraUsers: s.jiraUsers.map((u) => ({
      accountId: u.accountId,
      displayName: jiraNameMap.get(u.accountId) ?? null,
    })),
    defaultRoleId: s.defaultRoleId,
    lastVerification: s.verifications[0] ? { status: s.verifications[0].status } : null,
    roles: s.roles.map((r) => ({ id: r.id, name: r.name, ratePerHour: Number(r.ratePerHour) })),
  }));

  const hasFilters = Boolean(search ?? tab);
  const emptyMessage = hasFilters
    ? "No hay proveedores que coincidan con los filtros."
    : "No hay proveedores. Se sincronizan automáticamente desde los contactos de tipo proveedor en Holded.";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Proveedores</h1>
          <p className="text-sm text-gray-500 mt-1">
            Sincronizados desde Holded.
          </p>
        </div>
        <SuppliersFilters />
      </div>

      <SuppliersTabNav tab={tab} />

      <SuppliersTable suppliers={suppliersData} roleTemplates={roleTemplates} workspaceId={firstWorkspace?.id ?? null} emptyMessage={emptyMessage} />
    </div>
  );
}
