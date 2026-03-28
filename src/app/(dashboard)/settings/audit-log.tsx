"use client";

import { formatDate } from "@/lib/utils";
import { AuditAction } from "@prisma/client";

const ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: "Creó",
  UPDATE: "Actualizó",
  DELETE: "Eliminó",
  CLASSIFY: "Clasificó",
  REVIEW: "Revisó",
  APPROVE: "Aprobó",
};

const ACTION_COLORS: Record<AuditAction, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  CLASSIFY: "bg-amber-100 text-amber-700",
  REVIEW: "bg-purple-100 text-purple-700",
  APPROVE: "bg-green-100 text-green-700",
};

interface Entry {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  userName: string;
  createdAt: Date;
}

export function AuditLog({ entries }: { entries: Entry[] }): React.JSX.Element {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4">
        No hay cambios registrados todavía
      </p>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Usuario</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Acción</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Entidad</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className="border-b border-gray-100 last:border-0"
            >
              <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                {formatDate(entry.createdAt)}
              </td>
              <td className="px-4 py-3 text-gray-900">{entry.userName}</td>
              <td className="px-4 py-3">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[entry.action]}`}
                >
                  {ACTION_LABELS[entry.action]}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500">
                {entry.entityType}{" "}
                <span className="font-mono text-xs">{entry.entityId.slice(0, 8)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
