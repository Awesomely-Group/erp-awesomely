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
import { ProjectBucketTeamSection } from "./project-bucket-team-section";

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
    const firstInvoice = await prisma.invoice.findFirst({
      where: {
        lines: { some: { classification: { projectId } } },
      },
      select: { date: true },
      orderBy: { date: "asc" },
    });
    from = firstInvoice?.date ?? new Date(currentYear, 0, 1);
    to = now;
  }

  const fromStr = format(from, "yyyy-MM-dd");
  const toStr = format(to, "yyyy-MM-dd");

  const [project, relatedInvoices, availableRoles] = await Promise.all([
    prisma.jiraProject.findUnique({
      where: { id: projectId },
      include: {
        workspace: true,
        hourBuckets: {
          include: { role: true },
        },
        regularFeeEntries: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          include: { role: true },
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
    prisma.roleTemplate.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!project) notFound();

  const invoiceMonthMap = new Map<string, { totalSale: number; totalPurchase: number }>();
  for (const inv of relatedInvoices) {
    const month = inv.date.toISOString().slice(0, 7);
    const current = invoiceMonthMap.get(month) ?? { totalSale: 0, totalPurchase: 0 };
    if (inv.type === "SALE") current.totalSale += Number(inv.totalEur);
    else current.totalPurchase += Number(inv.totalEur);
    invoiceMonthMap.set(month, current);
  }
  const invoicesByMonth = [...invoiceMonthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({ month, totalSale: d.totalSale, totalPurchase: d.totalPurchase }));
  const totalExpensesEur = relatedInvoices
    .filter((inv) => inv.type === "PURCHASE")
    .reduce((sum, inv) => sum + Number(inv.totalEur), 0);

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
            marca={project.workspace.name}
            config={{
              isPrecioCerrado: project.isPrecioCerrado,
              isBolsasHoras: project.isBolsasHoras,
              isFeeRegular: project.isFeeRegular,
              fixedPrice: project.fixedPrice !== null ? Number(project.fixedPrice) : null,
              budgetedHours: project.budgetedHours,
              fixedPriceInvoiceId: project.fixedPriceInvoiceId ?? null,
              hourBuckets: project.hourBuckets.map((b) => ({
                id: b.id,
                roleId: b.roleId,
                roleName: b.role.name,
                ratePerHour: Number(b.role.ratePerHour),
                totalHours: b.totalHours,
                alertThreshold: b.alertThreshold,
                active: b.active,
                startDate: b.startDate?.toISOString().slice(0, 10) ?? "",
                endDate: b.endDate?.toISOString().slice(0, 10) ?? "",
                invoiceId: b.invoiceId ?? null,
              })),
              regularFeeEntries: project.regularFeeEntries.map((e) => ({
                id: e.id,
                label: e.label,
                monthlyFee: Number(e.monthlyFee),
                maxHoursPerMonth: e.maxHoursPerMonth,
                roleId: e.roleId ?? null,
                roleName: e.role?.name ?? null,
                invoiceId: e.invoiceId ?? null,
              })),
            }}
            availableRoles={availableRoles.map((r) => ({
              id: r.id,
              name: r.name,
              ratePerHour: Number(r.ratePerHour),
            }))}
          />
        </div>
      </div>

      {/* Overview charts + KPIs */}
      <ProjectOverviewCharts
        projectId={project.id}
        hasTempoToken={!!project.workspace.tempoApiToken}
        from={fromStr}
        to={toStr}
        totalInvoicesEur={relatedInvoices.filter((inv) => inv.type === "SALE").reduce((sum, inv) => sum + Number(inv.totalEur), 0)}
        invoicesByMonth={invoicesByMonth}
        totalExpensesEur={totalExpensesEur}
      />

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
          regularFeeEntries: project.regularFeeEntries.map((e) => ({
            id: e.id,
            label: e.label,
            monthlyFee: Number(e.monthlyFee),
            maxHoursPerMonth: e.maxHoursPerMonth,
          })),
        }}
      />

      {/* Asignación de roles para proyectos sin bolsas de horas */}
      {!!project.workspace.tempoApiToken && !project.isBolsasHoras && (
        <ProjectBucketTeamSection
          projectId={project.id}
          from={fromStr}
          to={toStr}
          bucketRoleIds={[]}
        />
      )}

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

