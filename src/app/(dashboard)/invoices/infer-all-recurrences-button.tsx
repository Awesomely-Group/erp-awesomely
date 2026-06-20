"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { inferAllRecurrences } from "./[id]/actions";

export function InferAllRecurrencesButton(): React.JSX.Element {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleClick(): void {
    startTransition(async () => {
      const { updated } = await inferAllRecurrences();
      setResult(`${updated} facturas de compra clasificadas`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
        title="Clasificar automáticamente la recurrencia de todas las facturas de compra sin clasificar"
      >
        <Sparkles className="h-3 w-3" />
        {isPending ? "Clasificando…" : "Auto-clasificar recurrencia"}
      </button>
      {result && (
        <span className="text-xs text-green-600">{result}</span>
      )}
    </div>
  );
}
