import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ForecastType } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import type { CashflowParams } from "@/lib/cashflow-data";
import { getForecastsListData } from "../forecasts-data";
import { ForecastsClient } from "../forecasts-client";

export default async function ForecastsManualesPage({
  searchParams,
}: {
  searchParams: Promise<CashflowParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const { forecasts, projects, accountMappings, suppliers } = await getForecastsListData(params);

  const activeForecasts = forecasts.filter((f) => !f.isPaused);
  const incomeForecasts = activeForecasts.filter((f) => f.type === ForecastType.INCOME);
  const expenseForecasts = activeForecasts.filter((f) => f.type === ForecastType.EXPENSE);

  const forecastTotals = {
    totalIncomePessimistic: incomeForecasts.reduce((s, f) => s + Number(f.amountPessimistic), 0),
    totalIncomeOptimistic: incomeForecasts.reduce((s, f) => s + Number(f.amountOptimistic), 0),
    totalExpensePessimistic: expenseForecasts.reduce((s, f) => s + Number(f.amountPessimistic), 0),
    totalExpenseOptimistic: expenseForecasts.reduce((s, f) => s + Number(f.amountOptimistic), 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/forecasts"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a previsiones
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Previsiones manuales</h1>
        <p className="text-sm text-gray-500 mt-1">Gestiona los escenarios pesimista y optimista</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ingresos pesimista</p>
          <p className="mt-2 text-xl font-bold text-blue-600">{formatCurrency(forecastTotals.totalIncomePessimistic)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ingresos optimista</p>
          <p className="mt-2 text-xl font-bold text-blue-700">{formatCurrency(forecastTotals.totalIncomeOptimistic)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gastos pesimista</p>
          <p className="mt-2 text-xl font-bold text-blue-600">{formatCurrency(forecastTotals.totalExpensePessimistic)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gastos optimista</p>
          <p className="mt-2 text-xl font-bold text-blue-700">{formatCurrency(forecastTotals.totalExpenseOptimistic)}</p>
        </div>
      </div>

      <ForecastsClient
        forecasts={forecasts}
        projects={projects}
        accountMappings={accountMappings}
        suppliers={suppliers}
      />
    </div>
  );
}
