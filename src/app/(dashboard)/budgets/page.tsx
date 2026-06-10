import { prisma } from "@/lib/prisma";
import { BudgetsTable } from "./budgets-table";
import type { BudgetRow, Workspace, Company } from "./budgets-table";

const WORKSPACE_ORDER = ["la troupe", "gigson solutions", "awesomely"];

export default async function BudgetsPage(): Promise<React.JSX.Element> {
  const [budgets, dbWorkspaces, companies] = await Promise.all([
    prisma.budget.findMany({
      include: {
        project: { select: { id: true, name: true, jiraKey: true } },
        lines: { select: { estimatedHours: true, pvpPerHour: true, costPerHour: true } },
        paymentTerms: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.jiraWorkspace.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        projects: {
          where: { active: true },
          select: { id: true, name: true, jiraKey: true },
          orderBy: { name: "asc" },
        },
      },
    }),
    prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }) as Promise<Company[]>,
  ]);

  const hasAwesomely = dbWorkspaces.some((w) => w.name.toLowerCase().includes("awesomely"));
  const workspaces: Workspace[] = [
    ...(dbWorkspaces as Workspace[]),
    ...(hasAwesomely ? [] : [{ id: null, name: "Awesomely", projects: [] }]),
  ].sort((a, b) => {
    const ai = WORKSPACE_ORDER.indexOf(a.name.toLowerCase());
    const bi = WORKSPACE_ORDER.indexOf(b.name.toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const rows: BudgetRow[] = budgets.map((b) => {
    const totalEstimatedHours = b.lines.reduce((sum, l) => sum + l.estimatedHours, 0);
    const totalPvp = b.lines.reduce(
      (sum, l) => sum + l.estimatedHours * Number(l.pvpPerHour),
      0
    );
    const totalCost = b.lines.reduce(
      (sum, l) => sum + l.estimatedHours * Number(l.costPerHour),
      0
    );
    return {
      id: b.id,
      name: b.name,
      projectId: b.project.id,
      projectName: b.project.name,
      projectKey: b.project.jiraKey,
      type: b.type,
      region: b.region,
      status: b.status,
      template: b.template,
      amount: Number(b.amount),
      currency: b.currency,
      estimatedHours: b.estimatedHours,
      monthlyFee: b.monthlyFee !== null ? Number(b.monthlyFee) : null,
      startDate: b.startDate?.toISOString() ?? null,
      endDate: b.endDate?.toISOString() ?? null,
      linesCount: b.lines.length,
      paymentTermsCount: b.paymentTerms.length,
      totalEstimatedHours,
      totalPvp,
      totalCost,
    };
  });

  return (
    <div className="space-y-6">
      <BudgetsTable rows={rows} workspaces={workspaces} companies={companies} />
    </div>
  );
}
