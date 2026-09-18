"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import { CrmActivityType, CrmLeadOrigin, Prisma } from "@prisma/client";

interface CreateLeadPayload {
  name: string;
  marca: string;
  /** Ver CrmStage.lineOfBusiness — default "GENERAL" si la marca no tiene líneas. */
  lineOfBusiness?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  amount?: number | null;
  notes?: string | null;
  ownerId?: string | null;
  origin?: CrmLeadOrigin | null;
  market?: string | null;
  seats?: number | null;
}

/** Alta manual desde el ERP (D7) — source: MANUAL, a diferencia del webhook de leads. */
export async function createLeadManual(payload: CreateLeadPayload): Promise<{ id: string }> {
  await requireSession();

  const lineOfBusiness = payload.lineOfBusiness ?? "GENERAL";
  const firstStage = await prisma.crmStage.findFirst({
    where: { marca: payload.marca, lineOfBusiness },
    orderBy: { order: "asc" },
  });
  if (!firstStage) {
    throw new Error(`No hay etapas configuradas para "${payload.marca}" / línea "${lineOfBusiness}"`);
  }

  const lead = await prisma.crmLead.create({
    data: {
      name: payload.name,
      marca: payload.marca,
      lineOfBusiness,
      source: "MANUAL",
      contactName: payload.contactName ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      amount: payload.amount ?? null,
      notes: payload.notes ?? null,
      ownerId: payload.ownerId ?? null,
      origin: payload.origin ?? null,
      market: payload.market ?? null,
      seats: payload.seats ?? null,
      stageId: firstStage.id,
      stageEvents: { create: { toStageId: firstStage.id, trigger: "MANUAL_DRAG" } },
    },
    select: { id: true },
  });

  revalidatePath("/crm");
  return lead;
}

/** Arrastrar de columna en el tablero — server action que llama el cliente dnd-kit. */
export async function moveLeadStage(leadId: string, toStageId: string): Promise<void> {
  const session = await requireSession();

  const lead = await prisma.crmLead.findUnique({
    where: { id: leadId },
    select: { stageId: true, marca: true, lineOfBusiness: true },
  });
  if (!lead) throw new Error("Lead no encontrado");
  if (lead.stageId === toStageId) return;

  // Defensa en profundidad: la UI ya solo ofrece etapas de la misma marca/línea de
  // negocio, pero un lead no debería poder saltar de funnel arrastrándolo (revisión
  // 2026-09-18, lineOfBusiness).
  const toStage = await prisma.crmStage.findUnique({ where: { id: toStageId } });
  if (!toStage || toStage.marca !== lead.marca || toStage.lineOfBusiness !== lead.lineOfBusiness) {
    throw new Error("La etapa de destino no pertenece al mismo funnel del lead");
  }

  await prisma.$transaction([
    prisma.crmLead.update({ where: { id: leadId }, data: { stageId: toStageId } }),
    prisma.crmLeadStageEvent.create({
      data: {
        leadId,
        fromStageId: lead.stageId,
        toStageId,
        trigger: "MANUAL_DRAG",
        changedByUserId: session.user.id,
      },
    }),
  ]);

  revalidatePath("/crm");
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function toggleLeadQualified(leadId: string, qualified: boolean): Promise<void> {
  await requireSession();
  await prisma.crmLead.update({ where: { id: leadId }, data: { qualified } });
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm");
}

/** Reasignar el comercial responsable — pensado para cuando haya usuarios COMERCIAL. */
export async function assignLeadOwner(leadId: string, ownerId: string | null): Promise<void> {
  await requireSession();
  await prisma.crmLead.update({ where: { id: leadId }, data: { ownerId } });
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm");
}

interface CreateActivityPayload {
  leadId?: string | null;
  accountId?: string | null;
  type: CrmActivityType;
  title: string;
  notes?: string | null;
  dueDate?: string | null;
}

export async function createActivity(payload: CreateActivityPayload): Promise<{ id: string }> {
  const session = await requireSession();

  const activity = await prisma.crmActivity.create({
    data: {
      leadId: payload.leadId ?? null,
      accountId: payload.accountId ?? null,
      type: payload.type,
      title: payload.title,
      notes: payload.notes ?? null,
      dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
      createdByUserId: session.user.id,
    },
    select: { id: true },
  });

  if (payload.leadId) revalidatePath(`/crm/leads/${payload.leadId}`);
  revalidatePath("/crm/actividades");
  return activity;
}

/**
 * Marca una actividad como completada. Si es una reunión (`MEETING`) de un lead ya
 * marcado como cualificado (checkbox), dispara la comisión QUALIFIED_MEETING (D9/F7) —
 * solo si la marca del lead tiene una `CommissionRule` activa (hoy solo LaTroupe) y el
 * lead tiene un `ownerId` asignado (si no, no hay a quién pagarle la comisión).
 */
export async function completeActivity(activityId: string): Promise<void> {
  await requireSession();

  const activity = await prisma.crmActivity.update({
    where: { id: activityId },
    data: { completedAt: new Date() },
    include: { lead: true },
  });

  if (activity.type === "MEETING" && activity.lead?.qualified && activity.lead.ownerId) {
    const rule = await prisma.commissionRule.findUnique({ where: { marca: activity.lead.marca } });
    if (rule?.active) {
      try {
        await prisma.commission.create({
          data: {
            type: "QUALIFIED_MEETING",
            marca: activity.lead.marca,
            userId: activity.lead.ownerId,
            leadId: activity.lead.id,
            activityId: activity.id,
            amount: rule.qualifiedMeetingAmount,
            status: "PENDING",
          },
        });
      } catch (err) {
        // @@unique([activityId]) — ya se generó la comisión en una ejecución anterior.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      }
    }
  }

  if (activity.leadId) revalidatePath(`/crm/leads/${activity.leadId}`);
  revalidatePath("/crm/actividades");
  revalidatePath("/crm/comisiones");
}

interface CreateAccountPayload {
  name: string;
  marca?: string | null;
  domain?: string | null;
  vatNumber?: string | null;
}

export async function createAccount(payload: CreateAccountPayload): Promise<{ id: string }> {
  await requireSession();
  const account = await prisma.crmAccount.create({
    data: {
      name: payload.name,
      marca: payload.marca ?? null,
      domain: payload.domain ?? null,
      vatNumber: payload.vatNumber ?? null,
    },
    select: { id: true },
  });
  revalidatePath("/crm/cuentas");
  return account;
}

export async function linkLeadToAccount(leadId: string, accountId: string | null): Promise<void> {
  await requireSession();
  await prisma.crmLead.update({ where: { id: leadId }, data: { accountId } });
  revalidatePath(`/crm/leads/${leadId}`);
}

interface UpdateCommissionRulePayload {
  marca: string;
  proposalPercent: number;
  qualifiedMeetingAmount: number;
  active: boolean;
}

/** Solo ADMIN puede tocar las reglas de comisión (D9). */
export async function updateCommissionRule(payload: UpdateCommissionRulePayload): Promise<void> {
  await requireAdmin();
  await prisma.commissionRule.upsert({
    where: { marca: payload.marca },
    update: {
      proposalPercent: payload.proposalPercent,
      qualifiedMeetingAmount: payload.qualifiedMeetingAmount,
      active: payload.active,
    },
    create: {
      marca: payload.marca,
      proposalPercent: payload.proposalPercent,
      qualifiedMeetingAmount: payload.qualifiedMeetingAmount,
      active: payload.active,
    },
  });
  revalidatePath("/crm/comisiones");
}

export async function updateCommissionStatus(
  commissionId: string,
  status: "PENDING" | "CONFIRMED" | "PAID" | "CANCELLED"
): Promise<void> {
  await requireAdmin();
  await prisma.commission.update({ where: { id: commissionId }, data: { status } });
  revalidatePath("/crm/comisiones");
}
