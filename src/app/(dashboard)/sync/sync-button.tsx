"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function SyncButton(): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  function handleSync(): void {
    startTransition(async () => {
      setResult(null);
      const res = await fetch("/api/sync", { method: "POST" });
      const data = (await res.json()) as {
        ok: boolean;
        companies?: number;
        workspaces?: number;
        errors?: string[];
      };

      if (data.ok) {
        setResult(
          `Sincronizado: ${data.companies} empresas, ${data.workspaces} workspaces`
        );
        router.refresh();
      } else {
        setResult("Error en la sincronización");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        onClick={handleSync}
        disabled={isPending}
        className={cn(
          "flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors",
        )}
      >
        <RefreshCw className={cn("h-4 w-4", isPending && "animate-spin")} />
        {isPending ? "Sincronizando..." : "Sincronizar ahora"}
      </button>
      {result && <p className="text-xs text-gray-500">{result}</p>}
    </div>
  );
}
