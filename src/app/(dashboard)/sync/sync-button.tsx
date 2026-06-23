"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SyncProgressEvent } from "@/lib/sync";

type SourceStatus = "running" | "done" | "error";

interface SourceItem {
  source: "HOLDED" | "JIRA";
  entityId: string;
  entityName: string;
  status: SourceStatus;
  error?: string;
}

export function SyncButton(): React.JSX.Element {
  const [isSyncing, setIsSyncing] = useState(false);
  const [items, setItems] = useState<SourceItem[]>([]);
  const router = useRouter();
  const [, startTransition] = useTransition();

  async function handleSync(): Promise<void> {
    setIsSyncing(true);
    setItems([]);

    try {
      const res = await fetch("/api/sync/stream", { method: "POST" });

      if (!res.ok || !res.body) {
        setItems([]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newlines
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue;

            let data: SyncProgressEvent;
            try {
              data = JSON.parse(line.slice(6)) as SyncProgressEvent;
            } catch {
              continue;
            }

            if (data.type === "init") {
              setItems(
                data.items.map((item) => ({
                  source: item.source,
                  entityId: item.entityId,
                  entityName: item.entityName,
                  status: "running",
                }))
              );
            } else if (data.type === "update") {
              setItems((prev) =>
                prev.map((item) =>
                  item.source === data.source && item.entityId === data.entityId
                    ? { ...item, status: data.status, error: data.error }
                    : item
                )
              );
            } else if (data.type === "complete") {
              startTransition(() => { router.refresh(); });
            } else if (data.type === "fatal") {
              setItems((prev) =>
                prev.map((item) =>
                  item.status === "running"
                    ? { ...item, status: "error", error: data.error }
                    : item
                )
              );
            }
          }
        }
      }
    } catch {
      // Network error — mark any still-running items as error
      setItems((prev) =>
        prev.map((item) =>
          item.status === "running"
            ? { ...item, status: "error", error: "Conexión interrumpida" }
            : item
        )
      );
    } finally {
      setIsSyncing(false);
    }
  }

  const allSettled = items.length > 0 && items.every((i) => i.status !== "running");
  const hasErrors = items.some((i) => i.status === "error");

  return (
    <div className="relative inline-flex flex-col items-end group">
      <button
        onClick={() => { void handleSync(); }}
        disabled={isSyncing}
        className={cn(
          "flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
        {isSyncing ? "Sincronizando..." : "Sincronizar ahora"}
      </button>

      {items.length > 0 && (
        <div className="absolute top-full right-0 mt-2 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden min-w-[280px]">
          <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Progreso de sincronización
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {items.map((item) => (
              <div
                key={`${item.source}-${item.entityId}`}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div className="mt-0.5 shrink-0">
                  {item.status === "running" && (
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                  )}
                  {item.status === "done" && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {item.status === "error" && (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800">
                    <span className="font-medium">
                      {item.source === "HOLDED" ? "Holded" : "Jira"}
                    </span>
                    <span className="text-gray-500"> · {item.entityName}</span>
                  </p>
                  {item.status === "running" && (
                    <p className="text-xs text-gray-400 mt-0.5">En progreso…</p>
                  )}
                  {item.status === "done" && (
                    <p className="text-xs text-green-600 mt-0.5">Completado</p>
                  )}
                  {item.status === "error" && item.error && (
                    <p
                      className="text-xs text-red-500 mt-0.5 line-clamp-2"
                      title={item.error}
                    >
                      {item.error}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {allSettled && (
            <div
              className={cn(
                "px-4 py-2.5 border-t text-xs font-medium",
                hasErrors
                  ? "border-red-100 bg-red-50 text-red-600"
                  : "border-green-100 bg-green-50 text-green-700"
              )}
            >
              {hasErrors ? "Sincronización completada con errores" : "Sincronización completada ✓"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
