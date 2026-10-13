"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, User as UserIcon } from "lucide-react";
import { MARCA_OPTIONS } from "@/lib/org";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { DEAL_TYPE_OPTIONS, ORIGIN_OPTIONS } from "@/lib/crm-relations";
import { createDealManual, moveDealStage } from "./actions";
import type { CrmDealType, CrmOrigin } from "@prisma/client";

export interface BoardStage {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

export interface BoardDeal {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  amount: number | null;
  stageId: string;
  dealType: CrmDealType;
  ownerName: string | null;
}

export interface BoardUser {
  id: string;
  label: string;
}

export interface BoardAccount {
  id: string;
  name: string;
}

/** Negocio nuevo no se marca: es el caso normal y marcarlo todo no distingue nada. */
const DEAL_TYPE_BADGE: Partial<Record<CrmDealType, string>> = {
  EXPANSION: "Ampliación",
  RENEWAL: "Renovación",
};

function DealCard({ deal }: { deal: BoardDeal }): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const badge = DEAL_TYPE_BADGE[deal.dealType];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "rounded-lg border border-gray-200 bg-white p-3 shadow-sm space-y-1.5 cursor-grab",
        isDragging && "opacity-50 z-10"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/crm/deals/${deal.id}`}
          className="text-sm font-medium text-gray-900 hover:text-indigo-700"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {deal.name}
        </Link>
        {badge && (
          <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            {badge}
          </span>
        )}
      </div>
      {/* La cuenta se enseña siempre: con varias oportunidades abiertas del mismo
          cliente, el nombre del deal por sí solo no dice de quién es. */}
      <Link
        href={`/crm/cuentas/${deal.accountId}`}
        onPointerDown={(e) => e.stopPropagation()}
        className="block truncate text-xs text-gray-500 hover:text-indigo-600"
      >
        {deal.accountName}
      </Link>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <UserIcon className="h-3 w-3" />
          {deal.ownerName ?? "Sin asignar"}
        </span>
        {deal.amount !== null && (
          <span className="font-medium text-gray-600">{formatCurrency(deal.amount)}</span>
        )}
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  deals,
}: {
  stage: BoardStage;
  deals: BoardDeal[];
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((sum, d) => sum + (d.amount ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-gray-50 p-2",
        isOver ? "border-indigo-300 bg-indigo-50" : "border-gray-200"
      )}
    >
      <div className="flex items-center justify-between px-1.5 py-1">
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wide",
            stage.isWon ? "text-emerald-600" : stage.isLost ? "text-red-500" : "text-gray-500"
          )}
        >
          {stage.name}
        </p>
        <span className="text-xs text-gray-400">{deals.length}</span>
      </div>
      {total > 0 && <p className="px-1.5 pb-1.5 text-xs text-gray-400">{formatCurrency(total)}</p>}
      <div className="flex-1 space-y-2 overflow-y-auto px-0.5 pb-1">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}

function NewDealModal({
  marca,
  lineOfBusiness,
  users,
  accounts,
  onClose,
}: {
  marca: string;
  lineOfBusiness: string;
  users: BoardUser[];
  accounts: BoardAccount[];
  onClose: () => void;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [dealType, setDealType] = useState<CrmDealType>("NEW_BUSINESS");
  const [origin, setOrigin] = useState<CrmOrigin | "">("");
  const [market, setMarket] = useState("");
  const [seats, setSeats] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    if (!accountId) {
      setError("Elige la cuenta. Si todavía no sabes de qué empresa es, créalo como lead.");
      return;
    }
    startTransition(async () => {
      await createDealManual({
        name,
        marca,
        lineOfBusiness,
        accountId,
        amount: amount ? Number(amount) : null,
        ownerId: ownerId || null,
        notes: notes || null,
        dealType,
        origin: origin || null,
        market: market || null,
        seats: seats ? Number(seats) : null,
        expectedCloseDate: expectedCloseDate || null,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">
          Nueva oportunidad — {marca}
          {lineOfBusiness !== "GENERAL" && ` (${lineOfBusiness})`}
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          Una cuenta puede tener varias abiertas a la vez, una por frente de trabajo.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Qué se vende (p. ej. «Rediseño de ficha de producto») *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">— Cuenta * —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Importe (€)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <select
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={dealType}
              onChange={(e) => setDealType(e.target.value as CrmDealType)}
            >
              {DEAL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <select
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            <option value="">Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              value={origin}
              onChange={(e) => setOrigin(e.target.value as CrmOrigin | "")}
            >
              <option value="">Origen (opcional)</option>
              {ORIGIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Mercado (UK/US/ES…)"
              value={market}
              onChange={(e) => setMarket(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Usuarios/seats"
              type="number"
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
            />
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600"
              title="Cierre previsto"
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
            />
          </div>
          <textarea
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Notas"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isPending ? "Creando…" : "Crear oportunidad"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CrmBoard({
  marca,
  lineOfBusiness,
  availableLines,
  stages,
  deals,
  users,
  accounts,
  pendingLeads,
}: {
  marca: string;
  lineOfBusiness: string;
  availableLines: string[];
  stages: BoardStage[];
  deals: BoardDeal[];
  users: BoardUser[];
  accounts: BoardAccount[];
  /** Leads sin cualificar de esta marca — el aviso de que hay cola que atender. */
  pendingLeads: number;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showNewDeal, setShowNewDeal] = useState(false);
  // Estado optimista local: dnd-kit necesita reflejar el movimiento al instante, sin
  // esperar el roundtrip del server action + revalidatePath. Patrón recomendado de
  // React para "ajustar estado cuando cambia una prop" (sin useEffect): se compara
  // contra la última prop `deals` vista, y si cambió (revalidatePath trajo datos
  // nuevos del server), se resetea el estado local a esa prop.
  const [localDeals, setLocalDeals] = useState(deals);
  const [prevDeals, setPrevDeals] = useState(deals);
  if (deals !== prevDeals) {
    setPrevDeals(deals);
    setLocalDeals(deals);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const toStageId = String(over.id);
    setLocalDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stageId: toStageId } : d)));
    startTransition(async () => {
      await moveDealStage(dealId, toStageId);
    });
  }

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">CRM — Pipeline</h1>
          <div className="mt-2 flex gap-1">
            {MARCA_OPTIONS.map((m) => (
              <Link
                key={m.value}
                href={`/crm?marca=${encodeURIComponent(m.value)}`}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium",
                  m.value === marca
                    ? "bg-indigo-100 text-indigo-700"
                    : "text-gray-500 hover:bg-gray-100"
                )}
              >
                {m.label}
              </Link>
            ))}
          </div>
          {availableLines.length > 1 && (
            <div className="mt-1.5 flex gap-1">
              {availableLines.map((line) => (
                <Link
                  key={line}
                  href={`/crm?marca=${encodeURIComponent(marca)}&lineOfBusiness=${encodeURIComponent(line)}`}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium",
                    line === lineOfBusiness
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  )}
                >
                  {line}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/crm/leads?marca=${encodeURIComponent(marca)}`}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Leads
            {pendingLeads > 0 && (
              <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                {pendingLeads}
              </span>
            )}
          </Link>
          <button
            onClick={() => setShowNewDeal(true)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Nueva oportunidad
          </button>
        </div>
      </div>

      {isPending && <p className="text-xs text-gray-400">Guardando…</p>}

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={localDeals.filter((d) => d.stageId === stage.id)}
            />
          ))}
          {stages.length === 0 && (
            <p className="text-sm text-gray-400">
              No hay etapas configuradas para {marca} / {lineOfBusiness}. Ejecuta{" "}
              <code className="rounded bg-gray-100 px-1">scripts/seed-growth-crm.ts</code>.
            </p>
          )}
        </div>
      </DndContext>

      {showNewDeal && (
        <NewDealModal
          marca={marca}
          lineOfBusiness={lineOfBusiness}
          users={users}
          accounts={accounts}
          onClose={() => setShowNewDeal(false)}
        />
      )}
    </div>
  );
}
