import { prisma } from "@/lib/prisma";
import { CompanyForm } from "./company-form";
import { CompanyLegalEntityPicker } from "./company-legal-entity-picker";
import { LegalEntityForm } from "./legal-entity-form";
import { WorkspaceCard, WorkspaceForm } from "./workspace-form";
import { AuditLog } from "./audit-log";
import { SsoAllowlistSection } from "./sso-allowlist";

export default async function SettingsPage(): Promise<React.JSX.Element> {
  const [companies, workspaces, auditLogs, legalEntities] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.jiraWorkspace.findMany({ orderBy: { name: "asc" } }),
    prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.legalEntity.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona las conexiones a Holded, Jira y el historial de cambios
        </p>
      </div>

      {/* Legal entities */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          Entidades legales
        </h2>
        <p className="text-sm text-gray-500">
          Agrupa empresas Holded (cuentas) bajo una misma sociedad o grupo para
          filtrar el dashboard.
        </p>
        {legalEntities.length > 0 && (
          <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {legalEntities.map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm text-gray-900">
                {e.name}
              </li>
            ))}
          </ul>
        )}
        <LegalEntityForm />
      </section>

      {/* Holded companies */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          Empresas Holded
        </h2>
        <div className="space-y-3">
          {companies.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  API key: ••••••••{c.holdedApiKey.slice(-4)}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <CompanyLegalEntityPicker
                  companyId={c.id}
                  legalEntityId={c.legalEntityId}
                  entities={legalEntities}
                />
                <span
                  className={`text-xs px-2 py-0.5 rounded-full h-fit ${
                    c.active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {c.active ? "Activa" : "Inactiva"}
                </span>
              </div>
            </div>
          ))}
        </div>
        <CompanyForm legalEntities={legalEntities} />
      </section>

      {/* Jira workspaces */}
      <section className="space-y-4">
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

      <SsoAllowlistSection />

      {/* Audit log */}
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
