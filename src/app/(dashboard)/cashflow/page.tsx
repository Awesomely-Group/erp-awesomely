import { Suspense } from "react";
import { InvoiceType } from "@prisma/client";
import { formatCurrency, formatDate, holdedInvoiceUrl, holdedProformaUrl } from "@/lib/utils";
import { getCashflowData, getCashflowCompanies, getCashflowAccounts, getMonthInvoices, getMonthProformas } from "@/lib/cashflow-data";
import type { CashflowParams, CashflowMonthlyPoint } from "@/lib/cashflow-data";
import Link from "next/link";
import { CashflowFilters } from "./cashflow-filters";
import { CashflowChart } from "./cashflow-chart";

type MonthInvoice = {
  id: string;
  holdedId: string;
  number: string | null;
  type: string;
  counterparty: string | null;
  date: Date;
  totalEur: unknown;
  status: string;
  company: { name: string };
};

type MonthProforma = {
  id: string;
  holdedId: string;
  number: string | null;
  counterparty: string | null;
  date: Date;
  totalEur: unknown;
  company: { name: string };
};

type MonthDocument =
  | { kind: "invoice"; data: MonthInvoice }
  | { kind: "proforma"; data: MonthProforma };

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<CashflowParams>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;

  const [{ monthly, kpis }, companies, accounts, monthInvoicesRaw, monthProformasRaw] =
    await Promise.all([
      getCashflowData(params, false),
      getCashflowCompanies(),
      getCashflowAccounts(),
      params.selectedMonth ? getMonthInvoices(params, params.selectedMonth) : Promise.resolve(null),
      params.selectedMonth ? getMonthProformas(params, params.selectedMonth) : Promise.resolve(null),
    ]);

  const monthInvoices = monthInvoicesRaw as MonthInvoice[] | null;
  const monthProformas = monthProformasRaw as MonthProforma[] | null;

  const monthDocuments: MonthDocument[] | null =
    monthInvoices !== null
      ? [
          ...monthInvoices.map((inv): MonthDocument => ({ kind: "invoice", data: inv })),
          ...(monthProformas ?? []).map((p): MonthDocument => ({ kind: "proforma", data: p })),
        ].sort((a, b) => a.data.date.getTime() - b.data.date.getTime())
      : null;

  const netIsPositive = kpis.netCashflow >= 0;

  const selectedMonthPoint = params.selectedMonth
    ? monthly.find((p: CashflowMonthlyPoint) => p.monthKey === params.selectedMonth)
    : null;

  function buildUrl(overrides: Record<string, string | undefined>): string {
    const sp = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      period: params.period,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      marca: params.marca,
      company: params.company,
      account: params.account,
      l1: params.l1,
      selectedMonth: params.selectedMonth,
      ...overrides,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) sp.set(k, v);
    }
    return `/cashflow?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Flujo de Caja</h1>
          <p className="text-sm text-gray-500 mt-1">Consolidado · en EUR</p>
        </div>
        <Suspense>
          <CashflowFilters companies={companies} accounts={accounts} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Entradas totales</p>
          <p className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(kpis.totalInflows)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Salidas totales</p>
          <p className="mt-2 text-2xl font-bold text-red-500">{formatCurrency(kpis.totalOutflows)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Flujo neto</p>
          <p className={`mt-2 text-2xl font-bold ${netIsPositive ? "text-indigo-600" : "text-red-600"}`}>
            {formatCurrency(kpis.netCashflow)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Entradas vs. Salidas por mes</h2>
        <Suspense>
          <CashflowChart data={monthly} showForecast={false} basePath="/cashflow" />
        </Suspense>
      </div>

      {params.selectedMonth && monthDocuments && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                Documentos de {selectedMonthPoint?.monthLabel ?? params.selectedMonth}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {monthDocuments.length} documento{monthDocuments.length !== 1 ? "s" : ""}
                {selectedMonthPoint && (
                  <>
                    {" · "}
                    <span className="text-green-600">Entradas {formatCurrency(selectedMonthPoint.inflows)}</span>
                    {" · "}
                    <span className="text-red-500">Salidas {formatCurrency(selectedMonthPoint.outflows)}</span>
                    {" · "}
                    <span className={selectedMonthPoint.net >= 0 ? "text-indigo-600" : "text-red-600"}>
                      Neto {formatCurrency(selectedMonthPoint.net)}
                    </span>
                  </>
                )}
              </p>
            </div>
            <Link
              href={buildUrl({ selectedMonth: undefined })}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-sm leading-none"
              title="Cerrar"
            >
              ✕
            </Link>
          </div>

          {monthDocuments.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400">
              No hay documentos con los filtros actuales para este mes.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Número</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Tipo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Contraparte</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Empresa</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Fecha</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Total (EUR)</th>
                </tr>
              </thead>
              <tbody>
                {monthDocuments.map((doc) => {
                  const isProforma = doc.kind === "proforma";
                  const isInvoiceSale = doc.kind === "invoice" && doc.data.type === InvoiceType.SALE;
                  const href = isProforma
                    ? holdedProformaUrl(doc.data.holdedId)
                    : holdedInvoiceUrl(
                        doc.data.holdedId,
                        (doc.data as MonthInvoice).type as InvoiceType
                      );
                  const tipoLabel = isProforma ? "Proforma" : isInvoiceSale ? "Venta" : "Compra";
                  const amountColor = isProforma
                    ? "text-blue-600"
                    : isInvoiceSale
                    ? "text-green-600"
                    : "text-red-600";

                  return (
                    <tr
                      key={`${doc.kind}-${doc.data.id}`}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {doc.data.number ?? (
                              <span className="italic text-gray-400 font-normal">Borrador</span>
                            )}
                          </span>
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                            title="Ver en Holded"
                          >
                            ↗
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{tipoLabel}</td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">
                        {doc.data.counterparty ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{doc.data.company.name}</td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDate(doc.data.date.toISOString())}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${amountColor}`}>
                        {formatCurrency(Number(doc.data.totalEur))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
