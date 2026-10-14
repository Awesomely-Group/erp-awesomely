/**
 * Las tres escrituras que la API y el MCP pueden hacer, y ninguna más.
 *
 * La regla que decide qué entra aquí: **el ERP tiene que ser la fuente de verdad del
 * dato y el cambio tiene que ser reversible desde una pantalla.** Por eso están
 * clasificar una factura, mover el estado de un proyecto y tocar un presupuesto en
 * borrador, y no están los pagos (mueven dinero), las nóminas (dato personal y
 * bancario), ningún borrado, disparar una sincronización (300 s de reloj: un bucle de
 * agente tumba el ERP y machaca Holded), aprobar o enviar un presupuesto y la firma
 * (efecto contractual), el CRM y las comisiones (afectan a la retribución de personas)
 * y cualquier cosa que escriba en Holded, que es un sistema externo sin vuelta atrás
 * desde aquí.
 *
 * Todo lo de aquí deja rastro en `AuditLog` con `viaApiKeyId`: quién lo hizo es la
 * persona dueña de la clave, y con qué credencial entró queda al lado.
 */
import { AuditAction, BudgetType, ClassificationStatus, ProjectStatus } from "@prisma/client";
import { deriveMarcaFromClassifications } from "@/lib/invoice-marca";
import { prisma } from "@/lib/prisma";
import { updateInvoiceStatus } from "@/lib/sync";

export type WriteResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Actor = { userId: string; keyId: string; companyIds: string[]; marcas: string[] };

/** Origen de los presupuestos escritos por API, para distinguirlos de LT_TOOLS/GIGSONAPPS. */
const ORIGEN_API = "API";

/** La factura tiene que estar dentro del alcance de la credencial, o no existe. */
async function invoiceEnAlcance(actor: Actor, invoiceId: string) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      ...(actor.companyIds.length > 0 ? { companyId: { in: actor.companyIds } } : {}),
      ...(actor.marcas.length > 0 ? { marca: { in: actor.marcas } } : {}),
    },
    include: { lines: { select: { id: true } } },
  });
}

/**
 * Clasifica **todas** las líneas de una factura a un proyecto y/o marca.
 *
 * Es la misma operación que hace la pantalla, con el mismo recálculo detrás: la marca
 * de la factura se deriva de sus clasificaciones y el estado se recalcula después. Sin
 * esos dos pasos la factura quedaría clasificada pero con la cabecera mintiendo.
 */
export async function classifyInvoice(
  actor: Actor,
  input: { invoiceId: string; projectId?: string | null; marca?: string | null; notes?: string | null },
): Promise<WriteResult<{ invoiceId: string; lines: number; marca: string | null }>> {
  const invoice = await invoiceEnAlcance(actor, input.invoiceId);
  if (!invoice) return { ok: false, error: "Esa factura no existe" };
  if (invoice.lines.length === 0) return { ok: false, error: "La factura no tiene líneas que clasificar" };

  if (input.projectId) {
    const project = await prisma.jiraProject.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });
    if (!project) return { ok: false, error: `No existe el proyecto ${input.projectId}` };
  }

  const datos = {
    projectId: input.projectId ?? null,
    marca: input.marca ?? null,
    notes: input.notes?.trim() || null,
    status: ClassificationStatus.CLASSIFIED,
    classifiedBy: actor.userId,
    classifiedAt: new Date(),
  };

  await prisma.$transaction(
    invoice.lines.map((line) =>
      prisma.classification.upsert({
        where: { invoiceLineId: line.id },
        create: { invoiceLineId: line.id, ...datos },
        update: datos,
      }),
    ),
  );

  const clasificaciones = await prisma.classification.findMany({
    where: { invoiceLine: { invoiceId: input.invoiceId }, status: { not: ClassificationStatus.IGNORED } },
    include: { invoiceLine: true, project: { include: { workspace: { select: { name: true } } } } },
  });
  const marca = deriveMarcaFromClassifications(clasificaciones);
  await prisma.invoice.update({ where: { id: input.invoiceId }, data: { marca } });
  await updateInvoiceStatus(input.invoiceId);

  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      viaApiKeyId: actor.keyId,
      action: AuditAction.CLASSIFY,
      entityType: "Invoice",
      entityId: input.invoiceId,
      newValue: { projectId: datos.projectId, marca },
      invoiceId: input.invoiceId,
    },
  });

  return { ok: true, data: { invoiceId: input.invoiceId, lines: invoice.lines.length, marca } };
}

/** Mueve un proyecto de estado. No crea ni borra proyectos: eso no se hace por API. */
export async function setProjectStatus(
  actor: Actor,
  input: { projectId: string; status: string },
): Promise<WriteResult<{ id: string; jiraKey: string; status: ProjectStatus }>> {
  if (!Object.values(ProjectStatus).includes(input.status as ProjectStatus)) {
    return {
      ok: false,
      error: `Estado no válido. Los que hay: ${Object.values(ProjectStatus).join(", ")}`,
    };
  }

  const anterior = await prisma.jiraProject.findUnique({
    where: { id: input.projectId },
    select: { id: true, status: true },
  });
  if (!anterior) return { ok: false, error: "Ese proyecto no existe" };

  const project = await prisma.jiraProject.update({
    where: { id: input.projectId },
    data: { status: input.status as ProjectStatus },
    select: { id: true, jiraKey: true, status: true },
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      viaApiKeyId: actor.keyId,
      action: AuditAction.UPDATE,
      entityType: "JiraProject",
      entityId: project.id,
      previousValue: { status: anterior.status },
      newValue: { status: project.status },
    },
  });

  return { ok: true, data: project };
}

/**
 * Crea o actualiza un presupuesto **en borrador**, idempotente por `externalRef`.
 *
 * Nunca puede dejarlo en otro estado: aprobar o enviar un presupuesto tiene efecto
 * frente a un cliente y lo hace una persona.
 *
 * La idempotencia reutiliza el `@@unique([sourcePlatform, externalRef])` que ya existía
 * para el webhook de propuestas, con `sourcePlatform: "API"` — misma convención, cero
 * migraciones, y los presupuestos escritos por API quedan distinguibles de los que
 * manda LT_TOOLS o GIGSONAPPS.
 */
export async function upsertBudgetDraft(
  actor: Actor,
  input: {
    externalRef: string;
    name: string;
    amount: number;
    type: BudgetType;
    projectId?: string | null;
    companyId?: string | null;
  },
): Promise<WriteResult<{ id: string; name: string; status: string; created: boolean }>> {
  const nombre = input.name.trim();
  if (!nombre) return { ok: false, error: "El nombre es obligatorio" };
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return { ok: false, error: "El importe tiene que ser un número no negativo" };
  }
  if (input.companyId && actor.companyIds.length > 0 && !actor.companyIds.includes(input.companyId)) {
    return { ok: false, error: "Esa sociedad no existe" };
  }

  const existente = await prisma.budget.findUnique({
    where: { sourcePlatform_externalRef: { sourcePlatform: ORIGEN_API, externalRef: input.externalRef } },
    select: { id: true, status: true },
  });

  if (existente && existente.status !== "DRAFT") {
    return {
      ok: false,
      error: `Ese presupuesto ya no está en borrador (${existente.status}): edítalo desde la pantalla`,
    };
  }

  const datos = {
    name: nombre,
    amount: input.amount,
    type: input.type,
    projectId: input.projectId ?? null,
    companyId: input.companyId ?? null,
  };

  const budget = existente
    ? await prisma.budget.update({ where: { id: existente.id }, data: datos, select: { id: true, name: true, status: true } })
    : await prisma.budget.create({
        data: { ...datos, sourcePlatform: ORIGEN_API, externalRef: input.externalRef, status: "DRAFT" },
        select: { id: true, name: true, status: true },
      });

  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      viaApiKeyId: actor.keyId,
      action: existente ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: "Budget",
      entityId: budget.id,
      newValue: { ...datos, externalRef: input.externalRef },
    },
  });

  return { ok: true, data: { ...budget, created: existente === null } };
}
