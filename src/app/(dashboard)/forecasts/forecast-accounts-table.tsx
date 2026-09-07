import { formatCurrency } from "@/lib/utils";
import { ACCOUNT_L1_GROUP_ORDER, OTHER_ACCOUNTS_LABEL } from "@/lib/org";
import type { ForecastAccountRow } from "@/lib/cashflow-data";

const L1_LABELS: Record<string, string> = {
  REVENUE: "Revenue",
  COGS: "COGS",
  OPEX: "Opex",
  CAPEX: "CAPEX",
  AMORT: "Amortización",
};

/**
 * Vista principal de /forecasts (E5, rediseño acordado en la revisión del
 * 2026-09-03): tabla de cuentas contables con Estimado (previsión manual, escenario
 * elegido) / Real (ya facturado, en el periodo filtrado) / Pendiente (Estimado − Real),
 * en vez del gráfico mensual como primer contenido. Agrupada por categoría L1 en el
 * mismo orden que el resto de la app (`ACCOUNT_L1_GROUP_ORDER`).
 */
export function ForecastAccountsTable({
  rows,
  scenarioLabel,
}: {
  rows: ForecastAccountRow[];
  scenarioLabel: string;
}): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <p className="px-2 py-10 text-center text-sm text-gray-400">
        No hay previsión ni facturación real para los filtros actuales.
      </p>
    );
  }

  const groupOrder = [...ACCOUNT_L1_GROUP_ORDER, "REVENUE", "AMORT", OTHER_ACCOUNTS_LABEL];
  const groups = new Map<string, ForecastAccountRow[]>();
  for (const row of rows) {
    const key = row.l1 || OTHER_ACCOUNTS_LABEL;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const orderedGroupKeys = [
    ...groupOrder.filter((g) => groups.has(g)),
    ...[...groups.keys()].filter((g) => !groupOrder.includes(g)),
  ];

  const totalEstimado = rows.reduce((s, r) => s + r.estimado, 0);
  const totalReal = rows.reduce((s, r) => s + r.real, 0);
  const totalPendiente = totalEstimado - totalReal;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Cuenta</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Marca</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Entidad</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
              Estimado <span className="font-normal normal-case text-gray-400">({scenarioLabel})</span>
            </th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Real</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Pendiente</th>
          </tr>
        </thead>
        <tbody>
          {orderedGroupKeys.map((groupKey) => {
            const groupRows = groups.get(groupKey)!;
            const groupLabel = L1_LABELS[groupKey] ?? groupKey;
            return (
              <>
                <tr key={`${groupKey}-header`} className="bg-gray-50">
                  <td colSpan={6} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {groupLabel}
                  </td>
                </tr>
                {groupRows.map((row) => (
                  <tr
                    key={`${row.accountMappingId}-${row.marca ?? ""}-${row.companyId ?? ""}`}
                    className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-gray-800 max-w-[220px] truncate">{row.description}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{row.marca ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{row.companyName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-blue-700">{formatCurrency(row.estimado)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-700">{formatCurrency(row.real)}</td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        row.pendiente >= 0 ? "text-amber-600" : "text-green-600"
                      }`}
                    >
                      {formatCurrency(row.pendiente)}
                    </td>
                  </tr>
                ))}
              </>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 font-semibold">
            <td className="px-4 py-3 text-gray-800" colSpan={3}>Total</td>
            <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(totalEstimado)}</td>
            <td className="px-4 py-3 text-right text-gray-800">{formatCurrency(totalReal)}</td>
            <td className={`px-4 py-3 text-right ${totalPendiente >= 0 ? "text-amber-600" : "text-green-600"}`}>
              {formatCurrency(totalPendiente)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
