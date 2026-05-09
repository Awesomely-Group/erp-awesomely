import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/utils";
import { getProjectProfitability } from "@/lib/profitability";
import { ProjectDateFilters } from "./project-date-filters";
import { ProjectInvoicesTable } from "./project-invoices-table";
import { ProjectTimesheetSection } from "./project-timesheet-section";
import { StatusBadge } from "./status-badge";

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}

export default async function ProjectDashboardPage({ params, searchParams }: Props): Promise<React.JSX.Element> {
  const { projectId } = await params;
  const sp = await searchParams;

  const project = await prisma.jiraProject.findUnique({
    where: { id: projectId },
    include: { workspace: true },
  });

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

  const periodLabel =
    sp.period === "year"
      ? `Año ${currentYear}`
      : sp.from
        ? `${sp.from} — ${sp.to}`
        : `Q${Math.floor(currentMonth / 3) + 1} ${currentYear}`;

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  const profitability = await getProjectProfitability(projectId, from, to);

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

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Ingresos · {periodLabel}</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {formatCurrency(profitability?.revenue ?? 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Gastos · {periodLabel}</p>
          <p className="text-2xl font-bold text-red-600 mt-1">
            {formatCurrency(profitability?.costs ?? 0)}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Margen · {periodLabel}</p>
          <p className={`text-2xl font-bold mt-1 ${(profitability?.margin ?? 0) >= 0 ? "text-indigo-600" : "text-red-600"}`}>
            {formatCurrency(profitability?.margin ?? 0)}
          </p>
          {(profitability?.revenue ?? 0) > 0 && (
            <p className="text-sm text-gray-400 mt-0.5">
              {profitability!.marginPct.toFixed(1)}% sobre ingresos
            </p>
          )}
        </div>
      </div>

      {/* Rentabilidad */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">
          Rentabilidad · {periodLabel}
        </h2>
        {profitability && profitability.invoices.length > 0 ? (
          <ProjectInvoicesTable invoices={profitability.invoices} />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
            Sin facturas clasificadas para este período
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
