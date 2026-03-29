import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { SyncButton } from "./sync-button";
import { SyncSource, SyncResult } from "@prisma/client";

const RESULT_LABELS: Record<SyncResult, string> = {
  SUCCESS: "OK",
  PARTIAL: "Parcial",
  ERROR: "Error",
};

const RESULT_COLORS: Record<SyncResult, string> = {
  SUCCESS: "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  ERROR: "bg-red-100 text-red-700",
};

export default async function SyncPage(): Promise<React.JSX.Element> {
  const logs = await prisma.syncLog.findMany({
    include: { company: true, workspace: true },
    orderBy: { startedAt: "desc" },
    take: 100,
  });

  const lastSync = logs[0]?.startedAt;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sincronización</h1>
          <p className="text-sm text-gray-500 mt-1">
            {lastSync
              ? `Última sincronización: ${formatDate(lastSync)}`
              : "Nunca sincronizado"}
            {" · "}
            Automática cada hora vía cron
          </p>
        </div>
        <SyncButton />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Fuente</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Entidad</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Registros</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Resultado</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr
                key={log.id}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {formatDate(log.startedAt)}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {log.source === SyncSource.HOLDED ? "Holded" : "Jira"}
                </td>
                <td className="px-4 py-3 text-gray-900">
                  {log.company?.name ?? log.workspace?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {log.source === SyncSource.HOLDED
                    ? `${log.invoicesSynced} facturas`
                    : `${log.projectsSynced} proyectos`}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${RESULT_COLORS[log.result]}`}
                  >
                    {RESULT_LABELS[log.result]}
                  </span>
                </td>
                <td className="px-4 py-3 text-red-600 text-xs max-w-xs" title={log.errorMessage ?? ""}>
                  <span className="line-clamp-2">{log.errorMessage ?? ""}</span>
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  No hay sincronizaciones todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
