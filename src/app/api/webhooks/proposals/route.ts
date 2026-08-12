import { json, badRequest, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createDocumentFromPdf, distributeDocument } from "@/lib/documenso";
import {
  authenticateProposalWebhook,
  brandToTemplate,
  BRAND_TO_SOURCE_PLATFORM,
} from "@/lib/proposals-brand";
import {
  BudgetType,
  BudgetRegion,
  BudgetLineType,
  PaymentTermValueType,
  Prisma,
} from "@prisma/client";

interface ProposalLineInput {
  lineType: BudgetLineType;
  phase?: string | null;
  task?: string | null;
  estimatedHours?: number | null;
  pvpPerHour?: number | null;
  costPerHour?: number | null;
  concept?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  rateType?: string | null;
  serviceType?: string | null;
  deliverables?: string[];
  sortOrder?: number;
}

interface ProposalPaymentTermInput {
  order: number;
  valueType: PaymentTermValueType;
  value: number;
  dueDate?: string | null;
  description?: string | null;
}

interface CreateProposalPayload {
  brand: string;
  externalRef: string;
  projectId: string;
  name: string;
  type: BudgetType;
  region?: BudgetRegion;
  amount: number;
  currency?: string;
  clientName?: string | null;
  holdedContactId?: string | null;
  companyId: string;
  executiveSummary?: string | null;
  paymentConditions?: string | null;
  validUntil?: string | null;
  lines?: ProposalLineInput[];
  paymentTerms?: ProposalPaymentTermInput[];
  pdfUrl: string;
  signerName: string;
  signerEmail: string;
}

/**
 * Registra una propuesta creada en gigsonapps.com/latroupeapps.com como `Budget` en el ERP
 * y la envía a firmar vía Documenso. Ver docs/proposals-plan-v2.md.
 *
 * Auth: header `x-webhook-secret` validado contra el secreto dedicado de la plataforma
 * llamante (nunca ERP_API_KEY/CRON_SECRET) — ver src/lib/proposals-brand.ts.
 * Idempotente por (sourcePlatform, externalRef): un reintento con el mismo externalRef
 * devuelve el Budget ya creado en vez de duplicarlo.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const payload = body as Partial<CreateProposalPayload>;

  if (!authenticateProposalWebhook(req, payload.brand)) return unauthorized();
  const brand = payload.brand as "SOLUTIONS" | "TROUPE"; // narrowed by authenticateProposalWebhook

  if (!payload.externalRef) return badRequest("externalRef es obligatorio");
  if (!payload.projectId) return badRequest("projectId es obligatorio");
  if (!payload.name) return badRequest("name es obligatorio");
  if (!payload.type || !Object.values(BudgetType).includes(payload.type)) {
    return badRequest(`type inválido. Valores: ${Object.values(BudgetType).join(", ")}`);
  }
  if (typeof payload.amount !== "number") return badRequest("amount es obligatorio (número)");
  if (!payload.companyId) return badRequest("companyId es obligatorio");
  if (!payload.pdfUrl) return badRequest("pdfUrl es obligatorio");
  if (!payload.signerName || !payload.signerEmail) {
    return badRequest("signerName y signerEmail son obligatorios");
  }

  const sourcePlatform = BRAND_TO_SOURCE_PLATFORM[brand];

  // Idempotencia: si ya existe un Budget para esta plataforma+externalRef, devolverlo tal cual.
  const existing = await prisma.budget.findUnique({
    where: { sourcePlatform_externalRef: { sourcePlatform, externalRef: payload.externalRef } },
  });
  if (existing) {
    return json(
      {
        budgetId: existing.id,
        documensoDocumentId: existing.documensoDocumentId,
        signingUrl: null, // no se regenera en reintentos — el link ya se envió la primera vez
        idempotent: true,
      },
      200
    );
  }

  const company = await prisma.company.findUnique({ where: { id: payload.companyId } });
  if (!company) return badRequest("companyId no corresponde a ninguna empresa");

  const lines = payload.lines ?? [];
  const paymentTerms = payload.paymentTerms ?? [];

  let budgetId: string;
  try {
    const budget = await prisma.budget.create({
      data: {
        projectId: payload.projectId,
        name: payload.name,
        type: payload.type,
        region: payload.region ?? "EU",
        amount: payload.amount,
        currency: payload.currency ?? "EUR",
        template: brandToTemplate(brand),
        clientName: payload.clientName ?? null,
        holdedContactId: payload.holdedContactId ?? null,
        companyId: payload.companyId,
        sourcePlatform,
        externalRef: payload.externalRef,
        executiveSummary: payload.executiveSummary ?? null,
        paymentConditions: payload.paymentConditions ?? null,
        validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
        sentAt: new Date(),
        documensoStatus: "DRAFT",
        lines: {
          create: lines.map((l, idx) => ({
            lineType: l.lineType,
            phase: l.phase ?? null,
            task: l.task ?? null,
            estimatedHours: l.estimatedHours ?? null,
            pvpPerHour: l.pvpPerHour ?? null,
            costPerHour: l.costPerHour ?? null,
            concept: l.concept ?? null,
            quantity: l.quantity ?? null,
            unitPrice: l.unitPrice ?? null,
            rateType: l.rateType ?? null,
            serviceType: l.serviceType ?? null,
            deliverables: l.deliverables ?? [],
            sortOrder: l.sortOrder ?? idx,
          })),
        },
        paymentTerms: {
          create: paymentTerms.map((t) => ({
            order: t.order,
            valueType: t.valueType,
            value: t.value,
            dueDate: t.dueDate ? new Date(t.dueDate) : null,
            description: t.description ?? null,
          })),
        },
      },
      select: { id: true },
    });
    budgetId = budget.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      // Carrera con otra petición concurrente para el mismo externalRef.
      const raced = await prisma.budget.findUnique({
        where: { sourcePlatform_externalRef: { sourcePlatform, externalRef: payload.externalRef } },
      });
      if (raced) return json({ budgetId: raced.id, documensoDocumentId: raced.documensoDocumentId, signingUrl: null, idempotent: true });
    }
    const message = err instanceof Error ? err.message : "Error al crear el presupuesto";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  // Enviar a firmar en Documenso. Si esto falla, el Budget ya existe (DRAFT) — el
  // llamador puede consultar /status y reintentar el envío manualmente más adelante
  // (fuera de alcance de este endpoint: no hay reintento automático todavía).
  try {
    const { documentId, signingUrl } = await createDocumentFromPdf({
      pdfUrl: payload.pdfUrl,
      title: payload.name,
      recipient: { name: payload.signerName, email: payload.signerEmail },
    });
    await distributeDocument(documentId);

    await prisma.budget.update({
      where: { id: budgetId },
      data: { documensoDocumentId: documentId, documensoStatus: "SENT" },
    });

    return json({ budgetId, documensoDocumentId: documentId, signingUrl }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al enviar la propuesta a Documenso";
    return json({ budgetId, error: message }, 502);
  }
}
