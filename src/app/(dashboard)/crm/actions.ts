"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/roles";
import { revalidatePath } from "next/cache";
import {
  CrmAccountType,
  CrmActivityType,
  CrmDealType,
  CrmDecisionRole,
  CrmLeadOrigin,
  CrmRelationType,
  Prisma,
} from "@prisma/client";

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
  /** Ver CrmDealType — por defecto negocio nuevo. */
  dealType?: CrmDealType;
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
      dealType: payload.dealType ?? "NEW_BUSINESS",
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
    select: { stageId: true, marca: true, lineOfBusiness: true, ownerId: true },
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

  // Al entrar en una etapa cualificada se cobran las reuniones ya cerradas que estaban
  // esperando: antes, cerrar la reunión y mover la tarjeta en el orden "natural" (primero
  // la reunión) dejaba la comisión sin generar para siempre.
  if (toStage.isQualified) {
    const pendientes = await prisma.crmActivity.findMany({
      where: { leadId, type: "MEETING", completedAt: { not: null }, commission: { is: null } },
      select: { id: true },
    });
    for (const actividad of pendientes) {
      await createMeetingCommission({ id: leadId, marca: lead.marca, ownerId: lead.ownerId }, actividad.id);
    }
  }

  revalidatePath("/crm");
  revalidatePath(`/crm/leads/${leadId}`);
  if (toStage.isQualified) revalidatePath("/crm/comisiones");
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
 * Comisión de 20€ por reunión cualificada (D9/F7). Solo si la marca del lead tiene una
 * `CommissionRule` activa (hoy solo LaTroupe) y el lead tiene `ownerId` — sin dueño no
 * hay a quién pagarle.
 *
 * Se intenta desde los DOS lados: al cerrar la reunión y al mover el lead a una etapa
 * cualificada. El orden entre esas dos acciones es arbitrario, y mirando solo una de
 * ellas se perdía la comisión cuando se hacían al revés. `Commission.activityId` es
 * `@unique`, así que intentarlo dos veces no paga dos veces.
 */
async function createMeetingCommission(
  lead: { id: string; marca: string; ownerId: string | null },
  activityId: string
): Promise<void> {
  if (lead.ownerId === null) return;
  const rule = await prisma.commissionRule.findUnique({ where: { marca: lead.marca } });
  if (!rule?.active) return;

  try {
    await prisma.commission.create({
      data: {
        type: "QUALIFIED_MEETING",
        marca: lead.marca,
        userId: lead.ownerId,
        leadId: lead.id,
        activityId,
        amount: rule.qualifiedMeetingAmount,
        status: "PENDING",
      },
    });
  } catch (err) {
    // @@unique([activityId]) — ya se generó la comisión en una ejecución anterior.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }
}

/**
 * Marca una actividad como completada. Si es una reunión de un lead que está en una etapa
 * cualificada, dispara la comisión.
 */
export async function completeActivity(activityId: string): Promise<void> {
  await requireSession();

  const activity = await prisma.crmActivity.update({
    where: { id: activityId },
    data: { completedAt: new Date() },
    include: { lead: { include: { stage: true } } },
  });

  if (activity.type === "MEETING" && activity.lead?.stage.isQualified) {
    await createMeetingCommission(activity.lead, activity.id);
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

/**
 * Marca la oportunidad como negocio nuevo, ampliación o renovación (D9). Importa para
 * los KPIs: con una oportunidad por frente de trabajo, los 7 frentes de un retainer
 * contarían como 7 ventas nuevas si todos quedaran en NEW_BUSINESS.
 */
export async function updateLeadDealType(leadId: string, dealType: CrmDealType): Promise<void> {
  await requireSession();
  await prisma.crmLead.update({ where: { id: leadId }, data: { dealType } });
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm");
}

/** Papel de una persona en la decisión de esta oportunidad. Idempotente por (lead, contacto). */
export async function setLeadContactRole(
  leadId: string,
  contactId: string,
  role: CrmDecisionRole
): Promise<void> {
  await requireSession();
  await prisma.crmLeadContact.upsert({
    where: { leadId_contactId: { leadId, contactId } },
    update: { role },
    create: { leadId, contactId, role },
  });
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function removeLeadContact(leadId: string, contactId: string): Promise<void> {
  await requireSession();
  await prisma.crmLeadContact.deleteMany({ where: { leadId, contactId } });
  revalidatePath(`/crm/leads/${leadId}`);
}

interface AccountRelationPayload {
  fromAccountId: string;
  toAccountId: string;
  type: CrmRelationType;
  note?: string | null;
}

/**
 * Enlaza dos cuentas sin fusionarlas (D8): cada una conserva sus leads, sus contactos y
 * su `holdedContactId`. Se guarda en un solo sentido; la ficha de la otra cuenta la lee
 * invertida (ver describeRelation en src/lib/crm-relations.ts).
 */
export async function addAccountRelation(payload: AccountRelationPayload): Promise<void> {
  await requireSession();

  if (payload.fromAccountId === payload.toAccountId) {
    throw new Error("Una cuenta no puede relacionarse consigo misma");
  }

  try {
    await prisma.crmAccountRelation.create({
      data: {
        fromAccountId: payload.fromAccountId,
        toAccountId: payload.toAccountId,
        type: payload.type,
        note: payload.note ?? null,
      },
    });
  } catch (err) {
    // @@unique([fromAccountId, toAccountId, type]) — ya existía esa misma relación.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
  }

  revalidatePath(`/crm/cuentas/${payload.fromAccountId}`);
  revalidatePath(`/crm/cuentas/${payload.toAccountId}`);
}

export async function removeAccountRelation(relationId: string): Promise<void> {
  await requireSession();
  const relation = await prisma.crmAccountRelation.delete({
    where: { id: relationId },
    select: { fromAccountId: true, toAccountId: true },
  });
  revalidatePath(`/crm/cuentas/${relation.fromAccountId}`);
  revalidatePath(`/crm/cuentas/${relation.toAccountId}`);
}

interface UpdateAccountPayload {
  accountId: string;
  type?: CrmAccountType;
  /** Prescriptor que trajo la cuenta — null la desvincula. */
  referredByAccountId?: string | null;
}

/**
 * Tipo de cuenta y prescriptor (D10). PARTNER es quien trae negocio —Z1 Gestión, Holded,
 * Odoo—; los proveedores no entran en el CRM porque el ERP ya tiene `Supplier`.
 */
export async function updateAccountClassification(payload: UpdateAccountPayload): Promise<void> {
  await requireSession();

  if (payload.referredByAccountId === payload.accountId) {
    throw new Error("Una cuenta no puede ser su propio prescriptor");
  }

  await prisma.crmAccount.update({
    where: { id: payload.accountId },
    data: {
      ...(payload.type ? { type: payload.type } : {}),
      ...(payload.referredByAccountId !== undefined
        ? { referredByAccountId: payload.referredByAccountId }
        : {}),
    },
  });

  revalidatePath(`/crm/cuentas/${payload.accountId}`);
  revalidatePath("/crm/cuentas");
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
