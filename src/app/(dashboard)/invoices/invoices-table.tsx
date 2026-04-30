"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Sin clasificar",
  PARTIAL: "Parcial",
  CLASSIFIED: "Clasificado",
  REVIEWED: "Revisado",
  APPROVED: "Aprobado",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  CLASSIFIED: "bg-blue-100 text-blue-700",
  REVIEWED: "bg-purple-100 text-purple-700",
  APPROVED: "bg-green-100 text-green-700",
};

interface InvoiceRow {
  id: string;
  holdedId: string;
  type: "SALE" | "PURCHASE";
  number: string | null;
  counterparty: string | null;
  date: string;
  totalEur: number;
  status: string;
  companyName: string;
  brand: string | null;
}

interface Props {
  invoices: InvoiceRow[];
  selectedId?: string;
}

export function InvoicesTable({ invoices, selectedId }: Props): React.JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  if (invoices.length === 0) {
    return (
      <tr>
        <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
          No hay facturas con estos filtros
        </td>
      </tr>
    );
  }

  return (
    <>
      {invoices.map((inv) => {
        const isSelected = inv.id === selectedId;
        return (
          <tr
            key={inv.id}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a, button")) return;
              const params = new URLSearchParams(sp.toString());
              if (params.get("invoiceId") === inv.id) {
                params.delete("invoiceId");
              } else {
                params.set("invoiceId", inv.id);
              }
              router.push(`/invoices?${params.toString()}`);
            }}
            className={`cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
              isSelected ? "bg-indigo-50 hover:bg-indigo-100" : "hover:bg-gray-50"
            }`}
          >
            <td className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`font-medium ${isSelected ? "text-indigo-700" : "text-gray-900"}`}>
                  {inv.number ?? inv.holdedId.slice(0, 8)}
                </span>
                <a
                  href={holdedInvoiceUrl(inv.holdedId, inv.type)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                  title="Ver en Holded"
                >
                  ↗
                </a>
              </div>
            </td>
            <td className="px-4 py-3 text-gray-600">
              {inv.type === "SALE" ? "Venta" : "Compra"}
            </td>
            <td className="px-4 py-3 text-gray-600">{inv.companyName}</td>
            <td className="px-4 py-3 text-gray-600">{inv.brand ?? "—"}</td>
            <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
              {inv.counterparty ?? "—"}
            </td>
            <td className="px-4 py-3 text-gray-600">{formatDate(inv.date)}</td>
            <td className="px-4 py-3 text-right font-medium">
              {formatCurrency(inv.totalEur)}
            </td>
            <td className="px-4 py-3">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? ""}`}
              >
                {STATUS_LABELS[inv.status] ?? inv.status}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}
