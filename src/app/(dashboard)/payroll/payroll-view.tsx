"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency, formatDate, holdedPayrollUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PaymentPreviewDrawer } from "@/app/(dashboard)/payments/payment-preview-drawer";

export interface PayrollRecordLine {
  type: string;
  amount: number;
  description: string | null;
}

export interface PayrollRecord {
  id: string;
  holdedSalaryRecordId: string;
  employeeName: string;
  employeeIban: string | null;
  description: string | null;
  date: string; // ISO
  totalPayable: number;
  paymentTotal: number;
  paymentPending: number;
  paymentStatus: "PENDING" | "PAID" | "PARTIALLY_PAID";
  companyName: string;
  lines: PayrollRecordLine[];
}

interface Props {
  records: PayrollRecord[];
}

const LINE_TYPE_LABELS: Record<string, string> = {
  salary: "Salario base",
  tax: "IRPF",
  companytax: "SS empresa",
  retention: "Retención",
  extra: "Extra",
  result: "Resultado",
  advance: "Anticipo",
  wage_garnishment: "Embargo",
  pago_delegado_it: "Pago delegado IT",
  salary_in_kind: "Salario en especie",
  salary_in_kind_retention: "Retención en especie",
  salary_in_kind_income: "Ingreso en especie",
};

function lineTypeLabel(type: string): string {
  return LINE_TYPE_LABELS[type] ?? type;
}

function toMonthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  const d = new Date(year, month - 1, 1);
  const label = d.toLocaleDateString("es-ES", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const STATUS_BADGE: Record<
  PayrollRecord["paymentStatus"],
  { label: string; className: string }
> = {
  PENDING: { label: "Pendiente", className: "bg-red-100 text-red-700" },
  PARTIALLY_PAID: {
    label: "Pago parcial",
    className: "bg-orange-100 text-orange-700",
  },
  PAID: { label: "Pagada", className: "bg-green-100 text-green-700" },
};

function PayrollRow({ record }: { record: PayrollRecord }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const badge = STATUS_BADGE[record.paymentStatus];

  function openPreview(): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("previewId", record.id);
    params.set("previewType", "payroll");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-gray-300 hover:text-gray-500"
          title={expanded ? "Ocultar desglose" : "Ver desglose"}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        <div
          className="flex-1 min-w-0 cursor-pointer group/preview"
          onClick={openPreview}
          title="Ver vista previa"
        >
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 truncate group-hover/preview:text-indigo-600 group-hover/preview:underline">
              {record.employeeName}
            </p>
            <span
              className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
                badge.className,
              )}
            >
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-gray-400">
            {record.description ?? formatDate(record.date)} ·{" "}
            {record.companyName}
            {record.employeeIban && (
              <span className="font-mono tracking-tight">
                {" "}
                · {record.employeeIban}
              </span>
            )}
          </p>
        </div>

        <div className="text-right shrink-0 w-28">
          <p className="text-xs text-gray-400">Total nómina</p>
          <p className="text-sm font-medium text-gray-700">
            {formatCurrency(record.totalPayable)}
          </p>
        </div>

        <div className="text-right shrink-0 w-28">
          <p className="text-xs text-gray-400">Pendiente</p>
          <p
            className={cn(
              "text-sm font-semibold",
              record.paymentPending <= 0.005
                ? "text-green-600"
                : "text-red-600",
            )}
          >
            {record.paymentPending <= 0.005
              ? "Pagado"
              : formatCurrency(record.paymentPending)}
          </p>
        </div>

        <a
          href={holdedPayrollUrl(record.holdedSalaryRecordId)}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-indigo-600 hover:text-indigo-700 whitespace-nowrap shrink-0"
        >
          Holded ↗
        </a>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pl-11">
          {record.lines.length === 0 ? (
            <p className="text-xs text-gray-400">Sin desglose disponible</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-500 mb-1">
                Desglose (capturado por el OCR de Holded)
              </p>
              {record.lines.map((line, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 text-xs text-gray-600"
                >
                  <span className="w-40 shrink-0">
                    {lineTypeLabel(line.type)}
                  </span>
                  <span
                    className={cn(
                      "font-medium",
                      line.amount < 0 ? "text-red-600" : "text-gray-700",
                    )}
                  >
                    {formatCurrency(line.amount)}
                  </span>
                  {line.description && (
                    <span className="italic text-gray-400 truncate">
                      {line.description}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PayrollView({ records }: Props): React.JSX.Element {
  const groups = useMemo(() => {
    const map = new Map<string, PayrollRecord[]>();
    for (const r of records) {
      const key = toMonthKey(r.date);
      const bucket = map.get(key) ?? [];
      bucket.push(r);
      map.set(key, bucket);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => ({
        key,
        label: monthLabel(key),
        items,
        subtotal: items.reduce((s, i) => s + i.totalPayable, 0),
      }));
  }, [records]);

  const totalPending = records.reduce((s, r) => s + r.paymentPending, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">RRHH · Nóminas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Nóminas sincronizadas desde Holded — desglose completo capturado por
          su OCR.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Nóminas sincronizadas
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {records.length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Pendiente de pago
          </p>
          <p className="mt-1 text-2xl font-bold text-red-600">
            {formatCurrency(totalPending)}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {records.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            No hay nóminas sincronizadas todavía. Comprueba que la API key de
            Holded tiene los scopes team:employees.read y
            accounting:payrolls.read habilitados, y lanza una sincronización
            desde /sync.
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-l-4 border-l-indigo-500 bg-indigo-50 text-indigo-800">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{group.label}</span>
                  <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-medium">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "nómina" : "nóminas"}
                  </span>
                </div>
                <span className="text-base font-bold">
                  {formatCurrency(group.subtotal)}
                </span>
              </div>
              {group.items.map((record) => (
                <PayrollRow key={record.id} record={record} />
              ))}
            </div>
          ))
        )}
      </div>

      <PaymentPreviewDrawer />
    </div>
  );
}
