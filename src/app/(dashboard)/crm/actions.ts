"use server";

import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/roles";
import { normalizeDealFields, type DealFieldInput } from "@/lib/crm-deal-input";
import { revalidatePath } from "next/cache";
import {
  CrmAccountType,
  CrmActivityType,
  CrmDealType,
  CrmDecisionRole,
  CrmOrigin,
  CrmRelationType,
  Prisma,
} from "@prisma/client";

interface CreateLeadPayload {
  name: string;
  marca: string;
  /** Ver CrmStage.lineOfBusiness — determina el embudo del deal cuando se cualifique. */
  lineOfBusiness?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** Presupuesto declarado, orientativo: siembra el importe del deal al convertir. */
  estimatedAmount?: number | null;
  notes?: string | null;
  ownerId?: string | null;
  origin?: CrmOrigin | null;
  market?: string | null;
  seats?: number | null;
  accountId?: string | null;
}

/**
 * Alta manual de lead desde el ERP (D7) — source: MANUAL, a diferencia del webhook.
 *
 * El lead NO entra en el embudo: el embudo es de oportunidades, y la oportunidad nace al
 * cualificar (`convertLeadToDeal`). Para el negocio que viene de un cliente que ya está
 * dentro —la mayor parte del volumen— no hay que pasar por aquí: se crea el deal directo
 * con `createDealManual`.
 */
export async function createLeadManual(payload: CreateLeadPayload): Promise<{ id: string }> {
  await requireSession();

  const lead = await prisma.crmLead.create({
    data: {
      name: payload.name,
      marca: payload.marca,
      lineOfBusiness: payload.lineOfBusiness ?? "GENERAL",
      source: "MANUAL",
      contactName: payload.contactName ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      estimatedAmount: payload.estimatedAmount ?? null,
      notes: payload.notes ?? null,
      ownerId: payload.ownerId ?? null,
      origin: payload.origin ?? null,
      market: payload.market ?? null,
      seats: payload.seats ?? null,
      accountId: payload.accountId ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/crm/leads");
  return lead;
}

interface CreateDealPayload {
  name: string;
  marca: string;
  lineOfBusiness?: string;
  /** Obligatorio: una oportunidad siempre es de alguien a quien se puede facturar. */
  accountId: string;
  amount?: number | null;
  notes?: string | null;
  ownerId?: string | null;
  origin?: CrmOrigin | null;
  market?: string | null;
  seats?: number | null;
  dealType?: CrmDealType;
  expectedCloseDate?: string | null;
  /** De qué lead nace, si nace de uno. */
  sourceLeadId?: string | null;
}

/**
 * Crea una oportunidad en la primera etapa de su embudo. Una cuenta puede tener varias
 * abiertas a la vez: el retainer de Moda re- tiene siete frentes vivos y cada uno se gana
 * o se pierde por su cuenta.
 */
export async function createDealManual(payload: CreateDealPayload): Promise<{ id: string }> {
  await requireSession();

  const lineOfBusiness = payload.lineOfBusiness ?? "GENERAL";
  const firstStage = await prisma.crmStage.findFirst({
    where: { marca: payload.marca, lineOfBusiness },
    orderBy: { order: "asc" },
  });
  if (!firstStage) {
    throw new Error(`No hay etapas configuradas para "${payload.marca}" / línea "${lineOfBusiness}"`);
  }

  const deal = await prisma.crmDeal.create({
    data: {
      name: payload.name,
      marca: payload.marca,
      lineOfBusiness,
      accountId: payload.accountId,
      stageId: firstStage.id,
      amount: payload.amount ?? null,
      notes: payload.notes ?? null,
      ownerId: payload.ownerId ?? null,
      origin: payload.origin ?? null,
      market: payload.market ?? null,
      seats: payload.seats ?? null,
      dealType: payload.dealType ?? "NEW_BUSINESS",
      expectedCloseDate: payload.expectedCloseDate ? new Date(payload.expectedCloseDate) : null,
      sourceLeadId: payload.sourceLeadId ?? null,
      stageEvents: { create: { toStageId: firstStage.id, trigger: "MANUAL_DRAG" } },
    },
    select: { id: true },
  });

  revalidatePath("/crm");
  revalidatePath(`/crm/cuentas/${payload.accountId}`);
  return deal;
}

interface ConvertLeadPayload {
  leadId: string;
  /** Cuenta a la que colgar la oportunidad. Si no se pasa, se usa la del lead o se crea. */
  accountId?: string | null;
  /** Nombre de la oportunidad. Por defecto, el del lead. */
  dealName?: string | null;
  amount?: number | null;
  dealType?: CrmDealType;
  expectedCloseDate?: string | null;
}

/**
 * Cualificar un lead = crear su primera oportunidad (2026-10-13). Es el único sitio donde
 * un lead pasa a QUALIFIED: no hay un interruptor suelto que diga "cualificado" sin que
 * exista el negocio detrás, que era justo lo que hacía que la etapa "Cualificado" y el
 * antiguo booleano `qualified` se contradijeran.
 *
 * Si el lead no tiene cuenta se le crea una con su nombre: a estas alturas ya sabemos de
 * qué empresa es —si no, no estaríamos cualificando— y obligar a elegirla antes en un
 * modal solo conseguiría que se cualificara menos.
 *
 * El lead sobrevive a la conversión: es el registro de por dónde entró y cuánto tardó.
 * Los deals siguientes de ese cliente ya no cuelgan de él (`sourceLeadId` null), porque
 * no vinieron de la misma puerta.
 */
export async function convertLeadToDeal(payload: ConvertLeadPayload): Promise<{ dealId: string }> {
  await requireSession();

  const lead = await prisma.crmLead.findUnique({
    where: { id: payload.leadId },
    select: {
      id: true, name: true, marca: true, lineOfBusiness: true, accountId: true,
      ownerId: true, origin: true, market: true, seats: true, estimatedAmount: true,
      status: true, notes: true,
    },
  });
  if (!lead) throw new Error("Lead no encontrado");
  if (lead.status === "DISQUALIFIED") {
    throw new Error("Este lead está descartado. Reactívalo antes de cualificarlo.");
  }

  let accountId = payload.accountId ?? lead.accountId;
  if (!accountId) {
    const account = await prisma.crmAccount.create({
      data: { name: lead.name, marca: lead.marca, lifecycle: "QUALIFIED" },
      select: { id: true },
    });
    accountId = account.id;
  }

  const deal = await createDealManual({
    name: payload.dealName ?? lead.name,
    marca: lead.marca,
    lineOfBusiness: lead.lineOfBusiness,
    accountId,
    amount: payload.amount ?? (lead.estimatedAmount !== null ? Number(lead.estimatedAmount) : null),
    notes: lead.notes,
    ownerId: lead.ownerId,
    origin: lead.origin,
    market: lead.market,
    seats: lead.seats,
    dealType: payload.dealType ?? "NEW_BUSINESS",
    expectedCloseDate: payload.expectedCloseDate ?? null,
    sourceLeadId: lead.id,
  });

  await prisma.crmLead.update({
    where: { id: lead.id },
    data: {
      status: "QUALIFIED",
      accountId,
      // Solo la primera vez: si de este lead salen dos oportunidades, el tiempo hasta
      // cualificar es el de la primera.
      ...(lead.status === "QUALIFIED" ? {} : { convertedAt: new Date() }),
    },
  });

  // Las reuniones ya cerradas de este lead se cobran ahora: cerrar la reunión y
  // cualificar pueden pasar en cualquier orden, y mirando solo uno de los dos lados se
  // perdía la comisión cuando se hacían al revés.
  await payPendingMeetingCommissions(lead.id, lead.marca, lead.ownerId);

  revalidatePath("/crm");
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${lead.id}`);
  revalidatePath(`/crm/cuentas/${accountId}`);
  revalidatePath("/crm/comisiones");
  return { dealId: deal.id };
}

/** Descartar un lead con motivo. El motivo es obligatorio: "no" sin por qué no enseña nada. */
export async function disqualifyLead(leadId: string, reason: string): Promise<void> {
  await requireSession();
  if (reason.trim() === "") throw new Error("Hace falta un motivo para descartar el lead");

  await prisma.crmLead.update({
    where: { id: leadId },
    data: { status: "DISQUALIFIED", disqualifiedReason: reason.trim() },
  });
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
}

/** Devuelve un lead descartado a la circulación, borrando el motivo. */
export async function reactivateLead(leadId: string): Promise<void> {
  await requireSession();
  await prisma.crmLead.update({
    where: { id: leadId },
    data: { status: "CONTACTED", disqualifiedReason: null },
  });
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
}

/**
 * Avance dentro del estado del lead (NEW → CONTACTED). No toca el embudo.
 *
 * `updateMany` y no `update` para que no reviente si el lead ya salió de NEW: el botón
 * solo se pinta para los nuevos, pero una pestaña abierta desde ayer enseña un estado que
 * ya no es el de la base, y pulsarlo ahí no debería tirar un error a la cara.
 */
export async function markLeadContacted(leadId: string): Promise<void> {
  await requireSession();
  await prisma.crmLead.updateMany({
    where: { id: leadId, status: "NEW" },
    data: { status: "CONTACTED" },
  });
  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${leadId}`);
}

/** Arrastrar de columna en el tablero — server action que llama el cliente dnd-kit. */
export async function moveDealStage(dealId: string, toStageId: string): Promise<void> {
  const session = await requireSession();

  const deal = await prisma.crmDeal.findUnique({
    where: { id: dealId },
    select: { stageId: true, marca: true, lineOfBusiness: true, accountId: true },
  });
  if (!deal) throw new Error("Oportunidad no encontrada");
  if (deal.stageId === toStageId) return;

  // Defensa en profundidad: la UI ya solo ofrece etapas de la misma marca/línea de
  // negocio, pero una oportunidad no debería poder saltar de embudo arrastrándola
  // (revisión 2026-09-18, lineOfBusiness).
  const toStage = await prisma.crmStage.findUnique({ where: { id: toStageId } });
  if (!toStage || toStage.marca !== deal.marca || toStage.lineOfBusiness !== deal.lineOfBusiness) {
    throw new Error("La etapa de destino no pertenece al mismo embudo de la oportunidad");
  }

  await prisma.$transaction([
    prisma.crmDeal.update({ where: { id: dealId }, data: { stageId: toStageId } }),
    prisma.crmDealStageEvent.create({
      data: {
        dealId,
        fromStageId: deal.stageId,
        toStageId,
        trigger: "MANUAL_DRAG",
        changedByUserId: session.user.id,
      },
    }),
  ]);

  revalidatePath("/crm");
  revalidatePath(`/crm/deals/${dealId}`);
  revalidatePath(`/crm/cuentas/${deal.accountId}`);
}

/** Reasignar el comercial responsable de una oportunidad. */
export async function assignDealOwner(dealId: string, ownerId: string | null): Promise<void> {
  await requireSession();
  await prisma.crmDeal.update({ where: { id: dealId }, data: { ownerId } });
  revalidatePath(`/crm/deals/${dealId}`);
  revalidatePath("/crm");
}

/** Reasignar el comercial responsable de un lead. */
export async function assignLeadOwner(leadId: string, ownerId: string | null): Promise<void> {
  await requireSession();
  await prisma.crmLead.update({ where: { id: leadId }, data: { ownerId } });
  revalidatePath(`/crm/leads/${leadId}`);
  revalidatePath("/crm/leads");
}

interface CreateActivityPayload {
  leadId?: string | null;
  dealId?: string | null;
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
      dealId: payload.dealId ?? null,
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
  if (payload.dealId) revalidatePath(`/crm/deals/${payload.dealId}`);
  revalidatePath("/crm/actividades");
  return activity;
}

/**
 * Comisión de 20€ por reunión cualificada (D9/F7). Se paga cuando una reunión de un lead
 * acaba en oportunidad: eso es lo que significa "cualificada", y es lo que el comercial
 * que la consiguió controla. Antes se miraba la etapa del embudo, que desde la separación
 * lead/deal ya no es del lead — y además pagaba por reuniones de oportunidades que venían
 * de un cliente de siempre, donde conseguir la reunión no tiene mérito.
 *
 * Solo si la marca tiene una `CommissionRule` activa (hoy solo LaTroupe) y el lead tiene
 * `ownerId` — sin dueño no hay a quién pagarle.
 *
 * Se intenta desde los DOS lados: al cerrar la reunión y al cualificar el lead. El orden
 * entre esas dos acciones es arbitrario, y mirando solo una de ellas se perdía la comisión
 * cuando se hacían al revés. `Commission.activityId` es `@unique`, así que intentarlo dos
 * veces no paga dos veces.
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

/** Cobra las reuniones ya cerradas de un lead que acaba de cualificarse. */
async function payPendingMeetingCommissions(
  leadId: string,
  marca: string,
  ownerId: string | null
): Promise<void> {
  if (ownerId === null) return;
  const pendientes = await prisma.crmActivity.findMany({
    where: { leadId, type: "MEETING", completedAt: { not: null }, commission: { is: null } },
    select: { id: true },
  });
  for (const actividad of pendientes) {
    await createMeetingCommission({ id: leadId, marca, ownerId }, actividad.id);
  }
}

/**
 * Marca una actividad como completada. Si es una reunión de un lead ya cualificado,
 * dispara la comisión.
 */
export async function completeActivity(activityId: string): Promise<void> {
  await requireSession();

  const activity = await prisma.crmActivity.update({
    where: { id: activityId },
    data: { completedAt: new Date() },
    include: { lead: { select: { id: true, marca: true, ownerId: true, status: true } } },
  });

  if (activity.type === "MEETING" && activity.lead?.status === "QUALIFIED") {
    await createMeetingCommission(activity.lead, activity.id);
  }

  if (activity.leadId) revalidatePath(`/crm/leads/${activity.leadId}`);
  if (activity.dealId) revalidatePath(`/crm/deals/${activity.dealId}`);
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

/** Enlaza un lead con la cuenta de la que es, antes de cualificarlo. */
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
export async function updateDealType(dealId: string, dealType: CrmDealType): Promise<void> {
  await requireSession();
  await prisma.crmDeal.update({ where: { id: dealId }, data: { dealType } });
  revalidatePath(`/crm/deals/${dealId}`);
  revalidatePath("/crm");
}

/** Papel de una persona en la decisión de esta oportunidad. Idempotente por (deal, contacto). */
export async function setDealContactRole(
  dealId: string,
  contactId: string,
  role: CrmDecisionRole
): Promise<void> {
  await requireSession();
  await prisma.crmDealContact.upsert({
    where: { dealId_contactId: { dealId, contactId } },
    update: { role },
    create: { dealId, contactId, role },
  });
  revalidatePath(`/crm/deals/${dealId}`);
}

export async function removeDealContact(dealId: string, contactId: string): Promise<void> {
  await requireSession();
  await prisma.crmDealContact.deleteMany({ where: { dealId, contactId } });
  revalidatePath(`/crm/deals/${dealId}`);
}

interface AccountRelationPayload {
  fromAccountId: string;
  toAccountId: string;
  type: CrmRelationType;
  note?: string | null;
}

/**
 * Enlaza dos cuentas sin fusionarlas (D8): cada una conserva sus oportunidades, sus
 * contactos y su `holdedContactId`. Se guarda en un solo sentido; la ficha de la otra cuenta la lee
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

interface UpdateDealPayload extends DealFieldInput {
  dealId: string;
}

/**
 * Edita los datos de la operación (2026-10-21). Hasta ahora importe, probabilidad,
 * fecha de cierre, origen, mercado, seats, notas y el propio nombre eran de escritura
 * única: se fijaban en `createDealManual`/`convertLeadToDeal` y después no había forma
 * de corregirlos sin entrar en la base de datos. Un importe mal tecleado al dar de alta
 * el deal se quedaba dentro del pipeline ponderado para siempre.
 *
 * NO se tocan aquí `marca` ni `lineOfBusiness`: juntos eligen el embudo, y cambiarlos
 * dejaría el `stageId` apuntando a una etapa de otro funnel (ver la nota del modelo:
 * no hay constraint de BD que lo impida). Tampoco `accountId`, que arrastra propuestas
 * y comisiones. Mover un deal de embudo o de cuenta es otra operación, con su remapeo.
 *
 * La validación de cada campo vive en src/lib/crm-deal-input.ts, que se prueba sin BD.
 */
export async function updateDeal(payload: UpdateDealPayload): Promise<void> {
  await requireSession();

  const { dealId, ...fields } = payload;
  const data = normalizeDealFields(fields);
  if (Object.keys(data).length === 0) return;

  const deal = await prisma.crmDeal.update({
    where: { id: dealId },
    data,
    select: { accountId: true },
  });

  revalidatePath(`/crm/deals/${dealId}`);
  // El importe y la probabilidad alimentan el pipeline ponderado del semáforo.
  revalidatePath("/crm");
  revalidatePath(`/crm/cuentas/${deal.accountId}`);
}
