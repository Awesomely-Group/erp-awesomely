import { prisma } from "@/lib/prisma";
import { SyncButton } from "./sync-button";
import { SyncTable, type SyncLogRow } from "./sync-table";
import { LocalDateTime } from "@/components/local-datetime";
import { SyncSource } from "@prisma/client";

export default async function SyncPage(): Promise<React.JSX.Element> {
  const logs = await prisma.syncLog.findMany({
    include: { company: true, workspace: true },
    orderBy: { startedAt: "desc" },
    take: 1000,
  });

  const lastSync = logs[0]?.startedAt;

  const rows: SyncLogRow[] = logs.map((log) => ({
    id: log.id,
    startedAt: log.startedAt.toISOString(),
    source: log.source,
    entityName: log.company?.name ?? log.workspace?.name ?? "—",
    records: log.source === SyncSource.HOLDED ? log.invoicesSynced : log.projectsSynced,
    recordsLabel:
      log.source === SyncSource.HOLDED
        ? `${log.invoicesSynced} facturas`
        : `${log.projectsSynced} proyectos`,
    result: log.result,
    errorMessage: log.errorMessage,
  }));

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sincronización</h1>
          <p className="text-sm text-gray-500 mt-1">
            {lastSync ? (
              <>
                Última sincronización: <LocalDateTime date={lastSync.toISOString()} />
              </>
            ) : (
              "Nunca sincronizado"
            )}
            {" · "}
            Automática cada día a las 6:00 UTC vía cron
          </p>
        </div>
        <SyncButton />
      </div>

      <SyncTable rows={rows} />
    </div>
  );
}
