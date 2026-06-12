import { prisma } from "@/lib/prisma";
import { CompanyCard, CompanyForm } from "./company-form";
import { WorkspaceCard, WorkspaceForm } from "./workspace-form";
import { AuditLog } from "./audit-log";
import { SsoAllowlistSection } from "./sso-allowlist";
import { AccountMappingTable } from "./account-mapping-table";
import { RoleTemplatesSection } from "./role-templates-section";
import { ApiKeysSection } from "./api-keys";

export default async function SettingsPage(): Promise<React.JSX.Element> {
  const [companies, workspaces, auditLogs, accountMappings, roleTemplates] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.jiraWorkspace.findMany({ orderBy: { name: "asc" } }),
    prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.accountMapping.findMany({ orderBy: [{ l1: "asc" }, { tag: "asc" }] }),
    prisma.roleTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-10">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona las conexiones a Holded, Jira y el historial de cambios
        </p>
      </div>

      <section className="space-y-4 max-w-3xl">
        <h2 className="text-base font-semibold text-gray-900">
          Empresas Holded
        </h2>
        <p className="text-sm text-gray-500">
          Cada cuenta de Holded conectada al ERP. La marca de cada factura se
          determina automáticamente a partir de los tags de Holded.
        </p>
        <div className="space-y-3">
          {companies.map((c) => (
            <CompanyCard
              key={c.id}
              id={c.id}
              name={c.name}
              holdedApiKey={c.holdedApiKey}
              active={c.active}
            />
          ))}
        </div>
        <CompanyForm />
      </section>

      {/* Jira workspaces */}
      <section className="space-y-4 max-w-3xl">
        <h2 className="text-base font-semibold text-gray-900">
          Workspaces Jira
        </h2>
        <div className="space-y-3">
          {workspaces.map((w) => (
            <WorkspaceCard
              key={w.id}
              id={w.id}
              name={w.name}
              domain={w.domain}
              email={w.email}
              active={w.active}
            />
          ))}
        </div>
        <WorkspaceForm />
      </section>

      <div className="max-w-3xl">
        <SsoAllowlistSection />
      </div>

      <div className="max-w-3xl">
        <ApiKeysSection />
      </div>

      {/* Roles de proveedor */}
      <section className="space-y-4 max-w-3xl">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Roles de proveedor</h2>
          <p className="text-sm text-gray-500 mt-1">
            Catálogo de roles predefinidos para asignar a los proveedores de servicios.
          </p>
        </div>
        <RoleTemplatesSection
          templates={roleTemplates.map((t) => ({ id: t.id, name: t.name, color: t.color, ratePerHour: Number(t.ratePerHour) }))}
        />
      </section>

      {/* Plan de Cuentas — full width */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Plan de Cuentas</h2>
          <p className="text-sm text-gray-500 mt-1">
            Tabla de equivalencias entre tags internos y cuentas contables (SL / OÜ).
            Las cuentas con L1 = COGS habilitan el selector de proyecto Jira al clasificar facturas.
          </p>
        </div>
        <AccountMappingTable
          mappings={accountMappings.map((m) => ({
            id: m.id,
            tag: m.tag,
            description: m.description,
            l1: m.l1,
            accountNumSL: m.accountNumSL,
            accountNameSL: m.accountNameSL,
            accountNumOU: m.accountNumOU,
            accountNameOU: m.accountNameOU,
          }))}
        />
      </section>

      {/* Audit log — full width */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          Historial de cambios
        </h2>
        <AuditLog
          entries={auditLogs.map((l) => ({
            id: l.id,
            action: l.action,
            entityType: l.entityType,
            entityId: l.entityId,
            userName: l.user?.name ?? l.user?.email ?? "Sistema",
            createdAt: l.createdAt,
          }))}
        />
      </section>
    </div>
  );
}
