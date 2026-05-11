import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { ProjectDateFilters } from "./project-date-filters";
import { ProjectTimesheetSection } from "./project-timesheet-section";
import { StatusBadge } from "./status-badge";

const HOLDED_STATUS_LABELS: Record<number, string> = {
  [-1]: "Cancelada",
  0: "Borrador",
  1: "Pendiente",
  2: "Pagada",
  3: "Vencida",
};

const HOLDED_STATUS_COLORS: Record<number, string> = {
  [-1]: "bg-gray-100 text-gray-500",
  0: "bg-gray-100 text-gray-500",
  1: "bg-amber-100 text-amber-700",
  2: "bg-green-100 text-green-700",
  3: "bg-red-100 text-red-700",
};

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}

export default async function ProjectDashboardPage({ params, searchParams }: Props): Promise<React.JSX.Element> {
  const { projectId } = await params;
  const sp = await searchParams;

  const [project, relatedInvoices] = await Promise.all([
    prisma.jiraProject.findUnique({
      where: { id: projectId },
      include: { workspace: true },
    }),
    prisma.invoice.findMany({
      where: { lines: { some: { classification: { projectId } } } },
      include: { company: true },
      orderBy: { date: "desc" },
    }),
  ]);

  if (!project) notFound();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let from: Date;
  let to: Date;

  if (sp.from && sp.to) {
    from = new Date(sp.from);
    to = new Date(sp.to);
  } else if (sp.period === "year") {
    from = new Date(currentYear, 0, 1);
    to = new Date(currentYear, 11, 31);
  } else {
    const q = Math.floor(currentMonth / 3);
    from = new Date(currentYear, q * 3, 1);
    to = new Date(currentYear, q * 3 + 3, 0);
  }

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Proyectos
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <StatusBadge projectId={project.id} status={project.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs mr-2">
              {project.jiraKey}
            </span>
            {project.workspace.name}
          </p>
        </div>
        <ProjectDateFilters from={fromStr} to={toStr} projectId={projectId} />
      </div>

      {/* Facturas relacionadas */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">
          Facturas relacionadas
          {relatedInvoices.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400">{relatedInvoices.length}</span>
          )}
        </h2>
        {relatedInvoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
            Sin facturas clasificadas en este proyecto
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Entidad legal</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Contraparte</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Total (EUR)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Estado</th>
                </tr>
              </thead>
              <tbody>
                {relatedInvoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-medium text-gray-900 hover:text-indigo-600 transition-colors"
                        >
                          {inv.number ?? <span className="italic text-gray-400 font-normal">Borrador</span>}
                        </Link>
                        <a
                          href={holdedInvoiceUrl(inv.holdedId, inv.type)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                          title="Ver en Holded"
                        >
                          ↗
                        </a>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{inv.company.name}</td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-[180px] truncate">{inv.counterparty ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">{formatDate(inv.date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-900">
                      {formatCurrency(Number(inv.totalEur))}
                    </td>
                    <td className="px-4 py-2.5">
                      {inv.holdedStatus != null && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${HOLDED_STATUS_COLORS[inv.holdedStatus] ?? "bg-gray-100 text-gray-500"}`}>
                          {HOLDED_STATUS_LABELS[inv.holdedStatus] ?? String(inv.holdedStatus)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Timesheet */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">Timesheet</h2>
        <ProjectTimesheetSection
          projectId={project.id}
          hasTempoToken={!!project.workspace.tempoApiToken}
          workspaceDomain={project.workspace.domain}
        />
      </section>
    </div>
  );
}
