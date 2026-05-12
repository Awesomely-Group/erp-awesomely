import { prisma } from "@/lib/prisma";
import { type SupplierTipo, Prisma } from "@prisma/client";
import { JiraClient } from "@/lib/jira";
import { SuppliersFilters } from "./suppliers-filters";
import { SuppliersTable } from "./suppliers-table";

interface Props {
  searchParams: Promise<{ search?: string; tipo?: string }>;
}

const TIPO_VALUES: SupplierTipo[] = ["SERVICIOS", "HERRAMIENTAS"];

function isTipo(v: string): v is SupplierTipo {
  return (TIPO_VALUES as string[]).includes(v);
}

export default async function SuppliersPage({ searchParams }: Props): Promise<React.JSX.Element> {
  const { search, tipo } = await searchParams;

  const where: Prisma.SupplierWhereInput = {
    active: true,
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    ...(tipo && isTipo(tipo) ? { tipo } : {}),
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
    jiraNameMap = await jira.getUsersByAccountIds(allAccountIds).catch(() => new Map());
  }

  const suppliersData = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    holdedContactId: s.holdedContactId,
    companyName: s.company?.name ?? null,
    tipo: s.tipo,
    jiraUsers: s.jiraUsers.map((u) => ({
      accountId: u.accountId,
      displayName: jiraNameMap.get(u.accountId) ?? null,
    })),
    defaultRoleId: s.defaultRoleId,
    lastVerification: s.verifications[0] ? { status: s.verifications[0].status } : null,
    roles: s.roles.map((r) => ({ id: r.id, name: r.name, ratePerHour: Number(r.ratePerHour) })),
  }));

  const emptyMessage = search ?? tipo
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

      <SuppliersTable suppliers={suppliersData} roleTemplates={roleTemplates} workspaceId={firstWorkspace?.id ?? null} emptyMessage={emptyMessage} />
    </div>
  );
}
