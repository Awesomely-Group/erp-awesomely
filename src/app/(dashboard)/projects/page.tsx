import { prisma } from "@/lib/prisma";
import { ProjectsTable, type ProjectRow } from "./projects-table";

export default async function ProjectsPage(): Promise<React.JSX.Element> {
  const workspaces = await prisma.jiraWorkspace.findMany({
    where: { active: true },
    include: {
      projects: {
        where: { active: true },
        include: {
          _count: { select: { classifications: true } },
          classifications: {
            where: { status: { in: ["CLASSIFIED", "APPROVED"] } },
            include: { invoiceLine: { include: { invoice: true } } },
          },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
        <p className="text-sm text-gray-500 mt-1">Proyectos de Jira sincronizados</p>
      </div>

      {workspaces.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-gray-400">
          No hay workspaces configurados. Ve a{" "}
          <a href="/settings" className="text-indigo-600 hover:underline">Configuración</a>{" "}
          para añadir uno.
        </div>
      )}

      {workspaces.map((ws) => {
        const totalProjects = ws.projects.length;
        const projectsWithActivity = ws.projects.filter(
          (p) => p._count.classifications > 0
        ).length;

        const rows: ProjectRow[] = ws.projects.map((project) => {
          let revenue = 0;
          let costs = 0;
          for (const c of project.classifications) {
            const totalEur = Number(c.invoiceLine.totalEur);
            if (c.invoiceLine.invoice.type === "SALE") {
              revenue += totalEur;
            } else {
              costs += totalEur;
            }
          }
          return {
            id: project.id,
            jiraKey: project.jiraKey,
            name: project.name,
            revenue,
            costs,
            margin: revenue - costs,
            classifications: project._count.classifications,
          };
        });

        return (
          <ProjectsTable
            key={ws.id}
            projects={rows}
            workspaceName={ws.name}
            workspaceDomain={ws.domain}
            totalProjects={totalProjects}
            projectsWithActivity={projectsWithActivity}
          />
        );
      })}
    </div>
  );
}
