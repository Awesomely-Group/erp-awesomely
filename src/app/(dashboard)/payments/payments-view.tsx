"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency, formatDate, holdedInvoiceUrl } from "@/lib/utils";
import { PaymentRow, type PaymentInvoice } from "./payment-row";

export interface PendingInvoice {
  id: string;
  holdedId: string;
  type: "PURCHASE" | "SALE";
  number: string | null;
  counterparty: string | null;
  dueDate: string | null;
  totalEur: number;
  effectivePending: number;
  companyName: string;
}

interface Props {
  pendingPayments: PaymentInvoice[];
  pendingCollections: PendingInvoice[];
  companies: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dueDayOf(dueDate: string): number {
  return parseInt(dueDate.slice(8, 10), 10);
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number) as [number, number];
  const d = new Date(year, month - 1, 1);
  const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function relativeMonthLabel(key: string, currentKey: string): string | null {
  if (key === "sin-fecha") return null;
  const [ky, km] = key.split("-").map(Number) as [number, number];
  const [cy, cm] = currentKey.split("-").map(Number) as [number, number];
  const diff = (ky - cy) * 12 + (km - cm);
  if (diff === 0) return null;
  if (diff === -1) return "Mes pasado";
  if (diff < -1) return `Hace ${Math.abs(diff)} meses`;
  if (diff === 1) return "Próximo mes";
  const daysUntil = Math.round((new Date(ky, km - 1, 1).getTime() - Date.now()) / 86400000);
  return daysUntil <= 31 ? `En ${daysUntil} días` : `En ${diff} meses`;
}

// ─── Month + half-month grouping ──────────────────────────────────────────────

interface MonthGroup<T> {
  key: string;
  label: string;
  isPast: boolean;
  isCurrent: boolean;
  firstHalf: T[];
  secondHalf: T[];
  subtotal: number;
}

function groupByDueMonth<T extends { dueDate: string | null; effectivePending: number }>(
  items: T[],
  currentKey: string,
): MonthGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.dueDate ? item.dueDate.slice(0, 7) : "sin-fecha";
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }

  const groups: MonthGroup<T>[] = [];
  for (const [key, groupItems] of map.entries()) {
    if (key === "sin-fecha") continue;
    groups.push({
      key,
      label: monthLabel(key),
      isPast: key < currentKey,
      isCurrent: key === currentKey,
      firstHalf: groupItems.filter((i) => !i.dueDate || dueDayOf(i.dueDate) <= 15),
      secondHalf: groupItems.filter((i) => !!i.dueDate && dueDayOf(i.dueDate) > 15),
      subtotal: groupItems.reduce((s, i) => s + i.effectivePending, 0),
    });
  }

  groups.sort((a, b) => a.key.localeCompare(b.key));

  if (map.has("sin-fecha")) {
    const groupItems = map.get("sin-fecha")!;
    groups.push({
      key: "sin-fecha",
      label: "Sin fecha",
      isPast: false,
      isCurrent: false,
      firstHalf: groupItems,
      secondHalf: [],
      subtotal: groupItems.reduce((s, i) => s + i.effectivePending, 0),
    });
  }

  return groups;
}

// ─── Drag & drop: batch items state ──────────────────────────────────────────

type BatchItemIds = Record<string, string[]>; // batchKey → ordered invoice IDs
const STORAGE_KEY = "payments-order-v2";

/** Compute initial (natural) batch assignment from pending payments. SSR-safe. */
function naturalBatchIds(payments: PaymentInvoice[]): BatchItemIds {
  const groups = groupByDueMonth(payments, CURRENT_MONTH);
  const result: BatchItemIds = {};
  for (const g of groups) {
    if (g.key === "sin-fecha") continue;
    result[`${g.key}-first`] = g.firstHalf.map((i) => i.id);
    result[`${g.key}-second`] = g.secondHalf.map((i) => i.id);
  }
  return result;
}

/**
 * Merge stored (possibly from localStorage) batch IDs with the natural grouping.
 * - Removes stale IDs (paid invoices no longer in `validIds`)
 * - Adds new unassigned invoices to their natural batch
 * - Preserves all existing manual positions
 */
function mergeWithNatural(
  stored: BatchItemIds,
  payments: PaymentInvoice[],
  validIds: Set<string>,
): BatchItemIds {
  const groups = groupByDueMonth(payments, CURRENT_MONTH);

  // Clean stale IDs from stored
  const result: BatchItemIds = {};
  for (const [key, ids] of Object.entries(stored)) {
    result[key] = ids.filter((id) => validIds.has(id));
  }

  // Ensure all natural batch keys exist
  for (const g of groups) {
    if (g.key === "sin-fecha") continue;
    const fk = `${g.key}-first`;
    const sk = `${g.key}-second`;
    if (!(fk in result)) result[fk] = [];
    if (!(sk in result)) result[sk] = [];
  }

  // Place unassigned invoices into their natural batch
  const assigned = new Set(Object.values(result).flat());
  for (const g of groups) {
    if (g.key === "sin-fecha") continue;
    for (const item of g.firstHalf) {
      if (!assigned.has(item.id)) {
        result[`${g.key}-first`].push(item.id);
        assigned.add(item.id);
      }
    }
    for (const item of g.secondHalf) {
      if (!assigned.has(item.id)) {
        result[`${g.key}-second`].push(item.id);
        assigned.add(item.id);
      }
    }
  }

  return result;
}

function findBatchForItem(id: string, batches: BatchItemIds): string | undefined {
  for (const [key, ids] of Object.entries(batches)) {
    if (ids.includes(id)) return key;
  }
  return undefined;
}

function saveBatches(batches: BatchItemIds): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
  } catch {
    // ignore
  }
}

// ─── Droppable batch section ──────────────────────────────────────────────────

function DroppableBatchSection({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`transition-colors duration-100 ${isOver ? "bg-indigo-50/50 ring-1 ring-inset ring-indigo-200" : ""}`}
    >
      {children}
    </div>
  );
}

// ─── Sortable payment row ─────────────────────────────────────────────────────

function SortablePaymentRow({ invoice }: { invoice: PaymentInvoice }): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: invoice.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // When dragging this item, render an invisible placeholder to preserve layout height
  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} className="opacity-0 pointer-events-none">
        <PaymentRow invoice={invoice} />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}>
      <PaymentRow invoice={invoice} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ─── Section headers ──────────────────────────────────────────────────────────

interface MonthSectionHeaderProps {
  label: string;
  count: number;
  subtotal: number;
  isPast: boolean;
  isCurrent: boolean;
  monthKey: string;
  isExpanded: boolean;
  onToggle: () => void;
}

function MonthSectionHeader({
  label, count, subtotal, isPast, isCurrent, monthKey, isExpanded, onToggle,
}: MonthSectionHeaderProps): React.JSX.Element {
  let borderColor = "border-l-gray-300";
  let bg = "bg-gray-50";
  let textColor = "text-gray-700";
  if (isPast) { borderColor = "border-l-red-500"; bg = "bg-red-50"; textColor = "text-red-800"; }
  else if (isCurrent) { borderColor = "border-l-indigo-500"; bg = "bg-indigo-50"; textColor = "text-indigo-800"; }

  const relTime = relativeMonthLabel(monthKey, CURRENT_MONTH);
  const ChevronIcon = isExpanded ? ChevronDown : ChevronUp;

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-4 py-3 border-b border-l-4 ${borderColor} ${bg} ${textColor} group transition-all`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <ChevronIcon className="h-4 w-4 shrink-0 opacity-50 group-hover:opacity-80 transition-opacity" />
        <span className="text-sm font-semibold">{label}</span>
        {isPast && (
          <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium shrink-0">
            Vencido
          </span>
        )}
        {isCurrent && (
          <span className="rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 text-xs font-medium shrink-0">
            Este mes
          </span>
        )}
        {relTime && (
          <span className="text-xs opacity-60 font-normal shrink-0">{relTime}</span>
        )}
        <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-xs font-medium shrink-0">
          {count} {count === 1 ? "factura" : "facturas"}
        </span>
      </div>
      <span className="text-base font-bold shrink-0 ml-4">{formatCurrency(subtotal)}</span>
    </button>
  );
}

interface HalfSectionHeaderProps {
  label: string;
  count: number;
  subtotal: number;
  isCurrentBatch?: boolean;
}

function HalfSectionHeader({ label, count, subtotal, isCurrentBatch }: HalfSectionHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50 text-xs text-gray-500">
      <span className="flex items-center gap-2 font-semibold uppercase tracking-wide text-[10px] text-gray-400">
        {label}
        <span className="font-normal normal-case tracking-normal">
          · {count} {count === 1 ? "factura" : "facturas"}
        </span>
        {isCurrentBatch && (
          <span className="rounded-full bg-indigo-100 text-indigo-600 px-2 py-0.5 text-[10px] font-semibold normal-case tracking-normal">
            Lote actual
          </span>
        )}
      </span>
      <span className="font-medium text-gray-600">{formatCurrency(subtotal)}</span>
    </div>
  );
}

// ─── Collapsible month group ──────────────────────────────────────────────────

interface CollapsibleMonthGroupProps {
  groupKey: string;
  label: string;
  count: number;
  subtotal: number;
  isPast: boolean;
  isCurrent: boolean;
  children: React.ReactNode;
}

function CollapsibleMonthGroup({
  groupKey, label, count, subtotal, isPast, isCurrent, children,
}: CollapsibleMonthGroupProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <div>
      <MonthSectionHeader
        label={label}
        count={count}
        subtotal={subtotal}
        isPast={isPast}
        isCurrent={isCurrent}
        monthKey={groupKey}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((v) => !v)}
      />
      {isExpanded && children}
    </div>
  );
}

// ─── Collection row ───────────────────────────────────────────────────────────

function CollectionRow({ row }: { row: PendingInvoice }): React.JSX.Element {
  const overdue = isOverdue(row.dueDate);
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_140px_130px_120px] gap-3 items-center px-4 py-3 border-b border-gray-100 last:border-0 text-sm">
      <div className="truncate text-gray-900">{row.counterparty ?? "—"}</div>
      <div className="truncate text-gray-600">{row.number ?? row.holdedId.slice(0, 8)}</div>
      <div className="truncate text-gray-600">{row.companyName}</div>
      <div className="text-right flex items-center justify-end gap-2">
        {overdue && (
          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
            Vencido
          </span>
        )}
        <span className={overdue ? "text-red-600 font-medium" : "text-gray-600"}>
          {row.dueDate ? formatDate(row.dueDate) : "Sin fecha"}
        </span>
      </div>
      <div className="text-right font-semibold text-amber-600">
        {formatCurrency(row.effectivePending)}
      </div>
      <div className="text-right flex items-center justify-end gap-2">
        <Link href={`/invoices/${row.id}`} className="text-xs text-indigo-600 hover:text-indigo-700">
          ERP
        </Link>
        <span className="text-gray-300">·</span>
        <Link
          href={holdedInvoiceUrl(row.holdedId, row.type)}
          target="_blank"
          className="text-xs text-indigo-600 hover:text-indigo-700"
        >
          Holded
        </Link>
      </div>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_MONTH = toMonthKey(new Date());
const CURRENT_BATCH: "first" | "second" = new Date().getDate() <= 15 ? "first" : "second";

// ─── Main view ────────────────────────────────────────────────────────────────

export function PaymentsView({
  pendingPayments,
  pendingCollections,
  companies,
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<"pagos" | "cobros">("pagos");
  const [company, setCompany] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [hidePaid, setHidePaid] = useState(false);

  // ── DnD state ──
  const [batchItemIds, setBatchItemIds] = useState<BatchItemIds>(() =>
    naturalBatchIds(pendingPayments),
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track the container from which the current drag started (to detect cross-container drops)
  const dragStartContainerRef = useRef<string | undefined>(undefined);
  // Snapshot of batchItemIds at drag start (used to revert on cancelled drags)
  const batchSnapshotRef = useRef<BatchItemIds>({});
  // Whether localStorage has been merged in yet
  const storageLoadedRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ── Load localStorage + keep in sync with pendingPayments ──
  useEffect(() => {
    setBatchItemIds((prev) => {
      let base = prev;
      if (!storageLoadedRef.current) {
        storageLoadedRef.current = true;
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) base = JSON.parse(raw) as BatchItemIds;
        } catch {
          // ignore
        }
      }
      return mergeWithNatural(base, pendingPayments, new Set(pendingPayments.map((p) => p.id)));
    });
  }, [pendingPayments]);

  // ── Filtered views ──
  const filteredPayments = useMemo(
    () =>
      pendingPayments.filter((row) => {
        if (company !== "all" && row.companyName !== company) return false;
        if (selectedMonth !== "all" && row.dueDate?.slice(0, 7) !== selectedMonth) return false;
        if (hidePaid && row.effectivePending <= 0.005) return false;
        return true;
      }),
    [pendingPayments, company, selectedMonth, hidePaid],
  );

  const filteredCollections = useMemo(
    () =>
      pendingCollections.filter((row) => {
        if (company !== "all" && row.companyName !== company) return false;
        if (selectedMonth !== "all" && row.dueDate?.slice(0, 7) !== selectedMonth) return false;
        return true;
      }),
    [pendingCollections, company, selectedMonth],
  );

  // Quick lookup for filtered payments
  const allPaymentsById = useMemo(
    () => new Map(filteredPayments.map((i) => [i.id, i])),
    [filteredPayments],
  );

  // ── Compute visible months from batchItemIds (for pagos tab) ──
  const visibleMonths = useMemo(() => {
    const months = new Set<string>();
    // Always show current month
    months.add(CURRENT_MONTH);
    // Show any month that has at least one currently-visible payment
    for (const [batchKey, ids] of Object.entries(batchItemIds)) {
      if (batchKey === "sin-fecha") continue;
      if (ids.some((id) => allPaymentsById.has(id))) {
        const monthKey = batchKey.replace(/-(?:first|second)$/, "");
        months.add(monthKey);
      }
    }
    return Array.from(months).sort();
  }, [batchItemIds, allPaymentsById]);

  // Get display items for a batch section (intersection of batchItemIds + current filter)
  function getItemsForBatch(batchKey: string): PaymentInvoice[] {
    return (batchItemIds[batchKey] ?? []).flatMap((id) => {
      const inv = allPaymentsById.get(id);
      return inv ? [inv] : [];
    });
  }

  // ── DnD handlers ──

  function handleDragStart(event: DragStartEvent): void {
    const id = String(event.active.id);
    setActiveId(id);
    dragStartContainerRef.current = findBatchForItem(id, batchItemIds);
    batchSnapshotRef.current = batchItemIds;
  }

  function handleDragOver(event: DragOverEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeItemId = String(active.id);
    const overId = String(over.id);

    setBatchItemIds((prev) => {
      const activeContainer = findBatchForItem(activeItemId, prev);
      // `over` can be a container ID (useDroppable) or an item ID inside a container
      const overContainer =
        overId in prev ? overId : findBatchForItem(overId, prev);

      // Only act on cross-container moves; same-container reorder is handled in onDragEnd
      if (!activeContainer || !overContainer || activeContainer === overContainer) {
        return prev;
      }

      const sourceItems = prev[activeContainer].filter((id) => id !== activeItemId);
      const targetItems = [...prev[overContainer]];
      const overIndex = targetItems.indexOf(overId);
      const insertAt = overIndex >= 0 ? overIndex : targetItems.length;

      return {
        ...prev,
        [activeContainer]: sourceItems,
        [overContainer]: [
          ...targetItems.slice(0, insertAt),
          activeItemId,
          ...targetItems.slice(insertAt),
        ],
      };
    });
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      // Drag cancelled — revert to snapshot
      setBatchItemIds(batchSnapshotRef.current);
      return;
    }

    const activeItemId = String(active.id);
    const overId = String(over.id);

    setBatchItemIds((prev) => {
      const activeContainer = findBatchForItem(activeItemId, prev);
      if (!activeContainer) return prev;

      // If the item crossed containers (handled in onDragOver), just persist
      if (activeContainer !== dragStartContainerRef.current) {
        saveBatches(prev);
        return prev;
      }

      // Same container — reorder
      const overContainer =
        overId in prev ? overId : findBatchForItem(overId, prev);
      if (!overContainer || overContainer !== activeContainer) {
        saveBatches(prev);
        return prev;
      }

      const items = prev[activeContainer];
      const oldIndex = items.indexOf(activeItemId);
      const newIndex = items.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
        saveBatches(prev);
        return prev;
      }

      const next = { ...prev, [activeContainer]: arrayMove(items, oldIndex, newIndex) };
      saveBatches(next);
      return next;
    });
  }

  // ── Collections (natural grouping, no DnD) ──
  const collectionsGroups = useMemo(
    () => groupByDueMonth(filteredCollections, CURRENT_MONTH),
    [filteredCollections],
  );

  // ── Summary totals ──
  const totalPendingPayments = filteredPayments.reduce((s, r) => s + r.effectivePending, 0);
  const totalPendingCollections = filteredCollections.reduce((s, r) => s + r.effectivePending, 0);
  const balance = totalPendingCollections - totalPendingPayments;

  const hasFilters = company !== "all" || selectedMonth !== CURRENT_MONTH;

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const inv of pendingPayments) {
      if (inv.dueDate) months.add(inv.dueDate.slice(0, 7));
    }
    for (const inv of pendingCollections) {
      if (inv.dueDate) months.add(inv.dueDate.slice(0, 7));
    }
    return Array.from(months).sort();
  }, [pendingPayments, pendingCollections]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header + filters */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pagos y Cobros</h1>
          <p className="text-sm text-gray-500 mt-1">Facturas pendientes de pago y cobro</p>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Empresa</label>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todas</option>
              {companies.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Mes</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Todos los meses</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500 font-medium">Pagadas</label>
            <button
              type="button"
              onClick={() => setHidePaid((v) => !v)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                hidePaid
                  ? "border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
                  : "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              }`}
            >
              {hidePaid ? "Ocultas" : "Visibles"}
            </button>
          </div>
          {hasFilters && (
            <button
              onClick={() => { setCompany("all"); setSelectedMonth(CURRENT_MONTH); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pagos pendientes</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(totalPendingPayments)}</p>
          <p className="text-xs text-gray-400 mt-1">{filteredPayments.length} facturas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Cobros pendientes</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{formatCurrency(totalPendingCollections)}</p>
          <p className="text-xs text-gray-400 mt-1">{filteredCollections.length} facturas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Balance neto</p>
          <p className={`mt-1 text-2xl font-bold ${balance >= 0 ? "text-indigo-600" : "text-amber-600"}`}>
            {formatCurrency(balance)}
          </p>
          <p className="text-xs text-gray-400 mt-1">{balance >= 0 ? "A favor" : "En contra"}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setTab("pagos")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "pagos"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Pagos pendientes
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {filteredPayments.length}
            </span>
          </button>
          <button
            onClick={() => setTab("cobros")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === "cobros"
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Cobros pendientes
            <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
              {filteredCollections.length}
            </span>
          </button>
        </nav>
      </div>

      {/* ── Pagos tab ─────────────────────────────────────────────────────────── */}
      {tab === "pagos" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filteredPayments.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No hay pagos pendientes con los filtros actuales.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              {visibleMonths.map((monthKey) => {
                const firstKey = `${monthKey}-first`;
                const secondKey = `${monthKey}-second`;
                const firstItems = getItemsForBatch(firstKey);
                const secondItems = getItemsForBatch(secondKey);
                const totalCount = firstItems.length + secondItems.length;
                const totalSubtotal =
                  [...firstItems, ...secondItems].reduce((s, i) => s + i.effectivePending, 0);
                const isPast = monthKey < CURRENT_MONTH;
                const isCurrent = monthKey === CURRENT_MONTH;

                return (
                  <CollapsibleMonthGroup
                    key={monthKey}
                    groupKey={monthKey}
                    label={monthLabel(monthKey)}
                    count={totalCount}
                    subtotal={totalSubtotal}
                    isPast={isPast}
                    isCurrent={isCurrent}
                  >
                    {/* Del 1 al 15 */}
                    <HalfSectionHeader
                      label="Del 1 al 15"
                      count={firstItems.length}
                      subtotal={firstItems.reduce((s, i) => s + i.effectivePending, 0)}
                      isCurrentBatch={isCurrent && CURRENT_BATCH === "first"}
                    />
                    <DroppableBatchSection id={firstKey}>
                      {firstItems.length > 0 ? (
                        <SortableContext
                          items={firstItems.map((i) => i.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {firstItems.map((inv) => (
                            <SortablePaymentRow key={inv.id} invoice={inv} />
                          ))}
                        </SortableContext>
                      ) : (
                        <p className="px-6 py-4 text-xs text-gray-400 italic border-b border-gray-100">
                          Sin facturas en este período — arrastra aquí para reasignar
                        </p>
                      )}
                    </DroppableBatchSection>

                    {/* Del 16 al fin de mes */}
                    <HalfSectionHeader
                      label="Del 16 al fin de mes"
                      count={secondItems.length}
                      subtotal={secondItems.reduce((s, i) => s + i.effectivePending, 0)}
                      isCurrentBatch={isCurrent && CURRENT_BATCH === "second"}
                    />
                    <DroppableBatchSection id={secondKey}>
                      {secondItems.length > 0 ? (
                        <SortableContext
                          items={secondItems.map((i) => i.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {secondItems.map((inv) => (
                            <SortablePaymentRow key={inv.id} invoice={inv} />
                          ))}
                        </SortableContext>
                      ) : (
                        <p className="px-6 py-4 text-xs text-gray-400 italic border-b border-gray-100">
                          Sin facturas en este período — arrastra aquí para reasignar
                        </p>
                      )}
                    </DroppableBatchSection>
                  </CollapsibleMonthGroup>
                );
              })}

              {/* Drag overlay — shown at cursor while dragging */}
              <DragOverlay>
                {activeId && allPaymentsById.has(activeId) ? (
                  <div className="shadow-2xl rounded-lg overflow-hidden bg-white border border-indigo-300 opacity-95">
                    <PaymentRow invoice={allPaymentsById.get(activeId)!} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      )}

      {/* ── Cobros tab (no DnD) ───────────────────────────────────────────────── */}
      {tab === "cobros" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_140px_130px_120px] gap-3 bg-gray-50 border-b border-gray-200 px-4 py-2 text-xs font-medium text-gray-500">
            <div>Cliente</div>
            <div>Factura</div>
            <div>Empresa</div>
            <div className="text-right">Vencimiento</div>
            <div className="text-right">Pendiente conciliar</div>
            <div className="text-right">Links</div>
          </div>

          {filteredCollections.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No hay cobros pendientes con los filtros actuales.
            </p>
          ) : (
            collectionsGroups.map((group) => (
              <CollapsibleMonthGroup
                key={group.key}
                groupKey={group.key}
                label={group.label}
                count={group.firstHalf.length + group.secondHalf.length}
                subtotal={group.subtotal}
                isPast={group.isPast}
                isCurrent={group.isCurrent}
              >
                {group.key !== "sin-fecha" && (() => (
                  <>
                    <HalfSectionHeader
                      label="Del 1 al 15"
                      count={group.firstHalf.length}
                      subtotal={group.firstHalf.reduce((s, i) => s + i.effectivePending, 0)}
                      isCurrentBatch={group.isCurrent && CURRENT_BATCH === "first"}
                    />
                    {group.firstHalf.length > 0
                      ? group.firstHalf.map((row) => <CollectionRow key={row.id} row={row} />)
                      : <p className="px-6 py-4 text-xs text-gray-400 italic border-b border-gray-100">Sin facturas en este período</p>}

                    <HalfSectionHeader
                      label="Del 16 al fin de mes"
                      count={group.secondHalf.length}
                      subtotal={group.secondHalf.reduce((s, i) => s + i.effectivePending, 0)}
                      isCurrentBatch={group.isCurrent && CURRENT_BATCH === "second"}
                    />
                    {group.secondHalf.length > 0
                      ? group.secondHalf.map((row) => <CollectionRow key={row.id} row={row} />)
                      : <p className="px-6 py-4 text-xs text-gray-400 italic border-b border-gray-100">Sin facturas en este período</p>}
                  </>
                ))()}
                {group.key === "sin-fecha" && group.firstHalf.map((row) => (
                  <CollectionRow key={row.id} row={row} />
                ))}
              </CollapsibleMonthGroup>
            ))
          )}
        </div>
      )}
    </div>
  );
}
