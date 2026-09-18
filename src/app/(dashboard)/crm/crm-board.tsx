"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus, User as UserIcon, CheckCircle2 } from "lucide-react";
import { MARCA_OPTIONS } from "@/lib/org";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { createLeadManual, moveLeadStage } from "./actions";

export interface BoardStage {
  id: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

export interface BoardLead {
  id: string;
  name: string;
  contactName: string | null;
  amount: number | null;
  stageId: string;
  source: string;
  qualified: boolean;
  ownerName: string | null;
}

export interface BoardUser {
  id: string;
  label: string;
}

function LeadCard({ lead }: { lead: BoardLead }): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

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
          href={`/crm/leads/${lead.id}`}
          className="text-sm font-medium text-gray-900 hover:text-indigo-700"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {lead.name}
        </Link>
        {lead.qualified && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
      </div>
      {lead.contactName && <p className="text-xs text-gray-500">{lead.contactName}</p>}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <UserIcon className="h-3 w-3" />
          {lead.ownerName ?? "Sin asignar"}
        </span>
        {lead.amount !== null && (
          <span className="font-medium text-gray-600">{formatCurrency(lead.amount)}</span>
        )}
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  leads,
}: {
  stage: BoardStage;
  leads: BoardLead[];
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((sum, l) => sum + (l.amount ?? 0), 0);

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
        <span className="text-xs text-gray-400">{leads.length}</span>
      </div>
      {total > 0 && <p className="px-1.5 pb-1.5 text-xs text-gray-400">{formatCurrency(total)}</p>}
      <div className="flex-1 space-y-2 overflow-y-auto px-0.5 pb-1">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

function NewLeadModal({
  marca,
  users,
  onClose,
}: {
  marca: string;
  users: BoardUser[];
  onClose: () => void;
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    if (!email.trim() && !phone.trim()) {
      setError("Necesitas al menos un email o un teléfono de contacto");
      return;
    }
    startTransition(async () => {
      await createLeadManual({
        name,
        marca,
        contactName: contactName || null,
        email: email || null,
        phone: phone || null,
        amount: amount ? Number(amount) : null,
        ownerId: ownerId || null,
        notes: notes || null,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-900">Nuevo lead — {marca}</h2>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Nombre del lead / empresa *"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Persona de contacto"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              placeholder="Teléfono"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <input
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            placeholder="Importe estimado (€)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
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
              {isPending ? "Creando…" : "Crear lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CrmBoard({
  marca,
  stages,
  leads,
  users,
}: {
  marca: string;
  stages: BoardStage[];
  leads: BoardLead[];
  users: BoardUser[];
}): React.JSX.Element {
  const [isPending, startTransition] = useTransition();
  const [showNewLead, setShowNewLead] = useState(false);
  // Estado optimista local: dnd-kit necesita reflejar el movimiento al instante, sin
  // esperar el roundtrip del server action + revalidatePath. Patrón recomendado de
  // React para "ajustar estado cuando cambia una prop" (sin useEffect): se compara
  // contra la última prop `leads` vista, y si cambió (revalidatePath trajo datos
  // nuevos del server), se resetea el estado local a esa prop.
  const [localLeads, setLocalLeads] = useState(leads);
  const [prevLeads, setPrevLeads] = useState(leads);
  if (leads !== prevLeads) {
    setPrevLeads(leads);
    setLocalLeads(leads);
  }

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) return;
    const leadId = String(active.id);
    const toStageId = String(over.id);
    setLocalLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stageId: toStageId } : l)));
    startTransition(async () => {
      await moveLeadStage(leadId, toStageId);
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
        </div>
        <button
          onClick={() => setShowNewLead(true)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Nuevo lead
        </button>
      </div>

      {isPending && <p className="text-xs text-gray-400">Guardando…</p>}

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              leads={localLeads.filter((l) => l.stageId === stage.id)}
            />
          ))}
          {stages.length === 0 && (
            <p className="text-sm text-gray-400">
              No hay etapas configuradas para {marca}. Ejecuta{" "}
              <code className="rounded bg-gray-100 px-1">scripts/seed-growth-crm.ts</code>.
            </p>
          )}
        </div>
      </DndContext>

      {showNewLead && (
        <NewLeadModal marca={marca} users={users} onClose={() => setShowNewLead(false)} />
      )}
    </div>
  );
}
