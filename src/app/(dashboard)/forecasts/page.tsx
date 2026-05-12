import { prisma } from "@/lib/prisma";
import { ForecastType } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { ForecastsClient } from "./forecasts-client";

export default async function ForecastsPage(): Promise<React.JSX.Element> {
  const [forecasts, projects] = await Promise.all([
    prisma.forecast.findMany({
      select: {
        id: true,
        month: true,
        type: true,
        marca: true,
        projectId: true,
        project: { select: { id: true, name: true } },
        description: true,
        amountOptimistic: true,
        amountPessimistic: true,
      },
      orderBy: [{ month: "asc" }],
    }),
    prisma.jiraProject.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const incomeForecasts = forecasts.filter((f) => f.type === ForecastType.INCOME);
  const expenseForecasts = forecasts.filter((f) => f.type === ForecastType.EXPENSE);

  const kpis = {
    totalIncomePessimistic: incomeForecasts.reduce((s, f) => s + Number(f.amountPessimistic), 0),
    totalIncomeOptimistic: incomeForecasts.reduce((s, f) => s + Number(f.amountOptimistic), 0),
    totalExpensePessimistic: expenseForecasts.reduce((s, f) => s + Number(f.amountPessimistic), 0),
    totalExpenseOptimistic: expenseForecasts.reduce((s, f) => s + Number(f.amountOptimistic), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Previsiones</h1>
          <p className="text-sm text-gray-500 mt-1">Estimaciones ERP · en EUR</p>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ingresos pesimista</p>
          <p className="mt-2 text-xl font-bold text-blue-600">{formatCurrency(kpis.totalIncomePessimistic)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ingresos optimista</p>
          <p className="mt-2 text-xl font-bold text-blue-700">{formatCurrency(kpis.totalIncomeOptimistic)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gastos pesimista</p>
          <p className="mt-2 text-xl font-bold text-blue-600">{formatCurrency(kpis.totalExpensePessimistic)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gastos optimista</p>
          <p className="mt-2 text-xl font-bold text-blue-700">{formatCurrency(kpis.totalExpenseOptimistic)}</p>
        </div>
      </div>

      <ForecastsClient forecasts={forecasts} projects={projects} />
    </div>
  );
}
