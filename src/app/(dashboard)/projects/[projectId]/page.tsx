import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { ProjectDateFilters } from "./project-date-filters";
import { ProjectOverviewCharts } from "./project-overview-charts";
import { ProjectInvoicesSection } from "./project-invoices-section";
import { StatusBadge } from "./status-badge";
import { ProjectSettingsPanel } from "./project-settings-panel";
import { ProjectTypesDashboard } from "./project-types-dashboard";

interface Props {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ from?: string; to?: string; period?: string }>;
}

export default async function ProjectDashboardPage({ params, searchParams }: Props): Promise<React.JSX.Element> {
  const { projectId } = await params;
  const sp = await searchParams;

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

  const [project, relatedInvoices, availableRoles] = await Promise.all([
    prisma.jiraProject.findUnique({
      where: { id: projectId },
      include: {
        workspace: true,
        hourBuckets: {
          where: { active: true },
          include: { role: { include: { supplier: true } } },
        },
      },
    }),
    prisma.invoice.findMany({
      where: {
        lines: { some: { classification: { projectId } } },
        date: { gte: from, lte: to },
      },
      include: { company: true },
      orderBy: { date: "desc" },
    }),
    prisma.supplierRole.findMany({
      where: { active: true },
      include: { supplier: true },
      orderBy: [{ supplier: { name: "asc" } }, { name: "asc" }],
    }),
  ]);

  if (!project) notFound();

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
        <div className="flex items-center gap-3 flex-wrap">
          <ProjectDateFilters from={fromStr} to={toStr} projectId={projectId} />
          <Link
            href={`/projects/${projectId}/timesheet`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ver Timesheet
          </Link>
          <ProjectSettingsPanel
            projectId={project.id}
            config={{
              isPrecioCerrado: project.isPrecioCerrado,
              isBolsasHoras: project.isBolsasHoras,
              isFeeRegular: project.isFeeRegular,
              fixedPrice: project.fixedPrice !== null ? Number(project.fixedPrice) : null,
              budgetedHours: project.budgetedHours,
              monthlyFee: project.monthlyFee !== null ? Number(project.monthlyFee) : null,
              maxHoursPerMonth: project.maxHoursPerMonth,
              hourBuckets: project.hourBuckets.map((b) => ({
                id: b.id,
                roleId: b.roleId,
                roleName: b.role.name,
                supplierName: b.role.supplier.name,
                ratePerHour: Number(b.role.ratePerHour),
                totalHours: b.totalHours,
                alertThreshold: b.alertThreshold,
              })),
            }}
            availableRoles={availableRoles.map((r) => ({
              id: r.id,
              name: r.name,
              supplierName: r.supplier.name,
              ratePerHour: Number(r.ratePerHour),
            }))}
          />
        </div>
      </div>

      {/* Type-specific sections */}
      <ProjectTypesDashboard
        projectId={project.id}
        from={fromStr}
        to={toStr}
        hasTempoToken={!!project.workspace.tempoApiToken}
        config={{
          isPrecioCerrado: project.isPrecioCerrado,
          isBolsasHoras: project.isBolsasHoras,
          isFeeRegular: project.isFeeRegular,
          fixedPrice: project.fixedPrice !== null ? Number(project.fixedPrice) : null,
          budgetedHours: project.budgetedHours,
          monthlyFee: project.monthlyFee !== null ? Number(project.monthlyFee) : null,
          maxHoursPerMonth: project.maxHoursPerMonth,
        }}
      />

      {/* Overview charts + KPIs */}
      <ProjectOverviewCharts
        projectId={project.id}
        hasTempoToken={!!project.workspace.tempoApiToken}
        from={fromStr}
        to={toStr}
      />

      {/* Facturas relacionadas */}
      <ProjectInvoicesSection
        invoices={relatedInvoices.map((inv) => ({
          id: inv.id,
          holdedId: inv.holdedId,
          type: inv.type,
          number: inv.number,
          companyName: inv.company.name,
          counterparty: inv.counterparty,
          date: inv.date.toISOString(),
          totalEur: Number(inv.totalEur),
          holdedStatus: inv.holdedStatus ?? null,
        }))}
      />
    </div>
  );
}

