import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { CompanyForm } from "./company-form";
import { WorkspaceCard, WorkspaceForm } from "./workspace-form";
import { AuditLog } from "./audit-log";

export default async function SettingsPage(): Promise<React.JSX.Element> {
  const [companies, workspaces, auditLogs] = await Promise.all([
    prisma.company.findMany({ orderBy: { name: "asc" } }),
    prisma.jiraWorkspace.findMany({ orderBy: { name: "asc" } }),
    prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-10 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona las conexiones a Holded, Jira y el historial de cambios
        </p>
      </div>

      {/* Holded companies */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-gray-900">
          Empresas Holded
        </h2>
        <div className="space-y-3">
          {companies.map((c) => (
            <div
              key={c.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-gray-900">{c.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  API key: ••••••••{c.holdedApiKey.slice(-4)}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${
                  c.active
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {c.active ? "Activa" : "Inactiva"}
              </span>
            </div>
          ))}
        </div>
        <CompanyForm />
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
