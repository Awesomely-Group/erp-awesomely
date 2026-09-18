"use client";

import { useTransition } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { completeActivity } from "../actions";

interface ActivityRow {
  id: string;
  type: string;
  title: string;
  notes: string | null;
  dueDate: string | null;
  leadId: string | null;
  leadName: string | null;
  accountName: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  NOTE: "Nota",
  CALL: "Llamada",
  MEETING: "Reunión",
  TASK: "Tarea",
};

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export function ActivitiesView({ activities }: { activities: ActivityRow[] }): React.JSX.Element {
  const [isPending, startTransition] = useTransition();

  function handleComplete(id: string): void {
    startTransition(async () => {
      await completeActivity(id);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Actividades</h1>
        <p className="text-sm text-gray-500">
          Próximos pasos pendientes — regla de la estrategia: ningún lead sin respuesta más de 24h
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Lead / Cuenta</th>
              <th className="px-4 py-2">Vencimiento</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activities.map((a) => (
              <tr key={a.id} className={cn("hover:bg-gray-50", isOverdue(a.dueDate) && "bg-red-50/50")}>
                <td className="px-4 py-2 text-gray-500">{TYPE_LABEL[a.type] ?? a.type}</td>
                <td className="px-4 py-2 text-gray-900">{a.title}</td>
                <td className="px-4 py-2">
                  {a.leadId ? (
                    <Link href={`/crm/leads/${a.leadId}`} className="text-indigo-600 hover:text-indigo-800">
                      {a.leadName}
                    </Link>
                  ) : (
                    <span className="text-gray-500">{a.accountName ?? "—"}</span>
                  )}
                </td>
                <td className={cn("px-4 py-2", isOverdue(a.dueDate) ? "font-medium text-red-600" : "text-gray-500")}>
                  {a.dueDate ? formatDate(a.dueDate) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => handleComplete(a.id)}
                    disabled={isPending}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    Completar
                  </button>
                </td>
              </tr>
            ))}
            {activities.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                  Sin actividades pendientes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
