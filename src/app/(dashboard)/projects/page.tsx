import { prisma } from "@/lib/prisma";
import { ProjectStatus } from "@prisma/client";
import { ProjectsTable, type ProjectRow } from "./projects-table";

export default async function ProjectsPage(): Promise<React.JSX.Element> {
  const workspaces = await prisma.jiraWorkspace.findMany({
    where: { active: true },
    include: {
      projects: {
        where: { active: true },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const allProjects: ProjectRow[] = workspaces.flatMap((ws) =>
    ws.projects.map((project) => ({
      id: project.id,
      jiraKey: project.jiraKey,
      name: project.name,
      workspaceName: ws.name,
      status: project.status as ProjectStatus,
      hasTempoToken: !!ws.tempoApiToken,
    }))
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Proyectos</h1>
        <p className="text-sm text-gray-500 mt-1">Proyectos de Jira sincronizados</p>
      </div>

      {workspaces.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-12 text-center text-gray-400">
          No hay workspaces configurados. Ve a{" "}
          <a href="/settings" className="text-indigo-600 hover:underline">
            Configuración
          </a>{" "}
          para añadir uno.
        </div>
      )}

      {workspaces.length > 0 && (
        <ProjectsTable allProjects={allProjects} />
      )}
    </div>
  );
}
