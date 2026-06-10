import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { BudgetDetail } from "./budget-detail";

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}): Promise<React.JSX.Element> {
  const { budgetId } = await params;

  const [budget, roles] = await Promise.all([
    prisma.budget.findUnique({
      where: { id: budgetId },
      include: {
        project: { select: { id: true, name: true, jiraKey: true } },
        company: { select: { id: true, name: true } },
        lines: {
          include: { role: { select: { id: true, name: true } } },
          orderBy: [{ phase: "asc" }, { sortOrder: "asc" }],
        },
        paymentTerms: {
          orderBy: { order: "asc" },
          include: { proforma: { select: { id: true, number: true, holdedId: true } } },
        },
      },
    }),
    prisma.roleTemplate.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!budget) notFound();

  return <BudgetDetail budget={budget} roles={roles} />;
}
