import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";

export default async function ProjectsPage(): Promise<React.JSX.Element> {
  const workspaces = await prisma.jiraWorkspace.findMany({
    where: { active: true },
    include: {
      projects: {
        where: { active: true },
        include: {
          _count: { select: { classifications: true } },
          classifications: {
            where: { status: { in: ["CLASSIFIED", "REVIEWED", "APPROVED"] } },
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

        return (
          <div key={ws.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{ws.name}</h2>
              <span className="text-xs text-gray-400">{ws.domain}</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {totalProjects} proyectos · {projectsWithActivity} con actividad
              </span>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Clave</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Proyecto</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Ingresos (EUR)</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Costes (EUR)</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Margen (EUR)</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Clasificaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ws.projects.map((project) => {
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

                    const margin = revenue - costs;

                    return (
                      <tr
                        key={project.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                            {project.jiraKey}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{project.name}</td>
                        <td className="px-4 py-3 text-right text-green-700">
                          {revenue > 0 ? formatCurrency(revenue) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600">
                          {costs > 0 ? formatCurrency(costs) : "—"}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${margin >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {revenue > 0 || costs > 0 ? formatCurrency(margin) : "—"}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">
                          {project._count.classifications > 0
                            ? project._count.classifications
                            : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {ws.projects.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                        Sin proyectos sincronizados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
