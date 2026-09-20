/**
 * Consultas que alimentan la API del portal de cliente (plan 2026-09-20).
 *
 * Todo lo de aquí acaba delante de un cliente, así que la regla es una: **nunca fiarse
 * del identificador que llega**. Cada consulta vuelve a comprobar que la cuenta es de
 * esta marca y es un cliente, y los campos internos (tarifas, nombres del equipo, keys
 * de issue) no salen ni aunque se pidan.
 */
import { prisma } from "./prisma";
import { BRAND_TO_MARCA } from "./proposals-brand";
import { bucketStatus, round2, type BucketStatus } from "./hour-bucket-consumption";
import {
  isExpiringSoon,
  isStale,
  paymentStatus,
  proformaStatusLabel,
  PORTAL_VISIBLE_PROFORMA_STATUSES,
  type PortalPaymentStatus,
} from "./portal-dto";
import { snapshotStaleHours, type PortalBrand } from "./portal-auth";
import { InvoiceType } from "@prisma/client";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ─── Resolución de cliente ─────────────────────────────────────────────────────

export type PortalResolveError =
  | "CLIENT_NOT_FOUND"
  | "NOT_A_CUSTOMER"
  | "WRONG_BRAND"
  | "AMBIGUOUS_EMAIL";

export interface PortalClientDto {
  clientId: string;
  name: string;
  marca: string | null;
  contactName: string | null;
  /** Sin contacto de Holded no habrá facturas ni proformas que enseñar. */
  hasBillingContact: boolean;
  /** Sin proyectos enlazados no habrá bolsas. */
  hasLinkedProjects: boolean;
}

export type PortalResolveResult =
  | { ok: true; client: PortalClientDto }
  | { ok: false; error: PortalResolveError; accountIds?: string[] };

/**
 * Del email de una persona a la cuenta de cliente.
 *
 * Devuelve motivos distinguibles porque el portal tiene que poder decir algo útil —"tu
 * correo no consta", "todavía no hay datos"— en vez de pintar un panel vacío que parece
 * que se ha roto. El portal, eso sí, responde siempre lo mismo al usuario: si no, el
 * formulario se convierte en un oráculo de quién es cliente.
 *
 * Con el mismo email en dos cuentas **no se adivina**: que un cliente vea las facturas
 * de otro es el fallo que se lleva por delante la funcionalidad entera.
 */
export async function resolvePortalClient(
  brand: PortalBrand,
  email: string,
): Promise<PortalResolveResult> {
  const normalized = email.trim().toLowerCase();
  if (normalized === "") return { ok: false, error: "CLIENT_NOT_FOUND" };

  const contacts = await prisma.crmContact.findMany({
    where: { email: { equals: normalized, mode: "insensitive" } },
    include: { account: true },
  });
  if (contacts.length === 0) return { ok: false, error: "CLIENT_NOT_FOUND" };

  const customers = contacts.filter((c) => c.account.lifecycle === "CUSTOMER");
  if (customers.length === 0) return { ok: false, error: "NOT_A_CUSTOMER" };

  const marca = BRAND_TO_MARCA[brand];
  const ofBrand = customers.filter((c) => c.account.marca === marca);
  if (ofBrand.length === 0) return { ok: false, error: "WRONG_BRAND" };

  const accountIds = [...new Set(ofBrand.map((c) => c.accountId))];
  if (accountIds.length > 1) return { ok: false, error: "AMBIGUOUS_EMAIL", accountIds };

  const contact = ofBrand[0];
  const linkedProjects = await prisma.jiraProject.count({
    where: { crmAccountId: contact.accountId, active: true },
  });

  return {
    ok: true,
    client: {
      clientId: contact.accountId,
      name: contact.account.name,
      marca: contact.account.marca,
      contactName: contact.name,
      hasBillingContact:
        contact.account.companyId !== null && contact.account.holdedContactId !== null,
      hasLinkedProjects: linkedProjects > 0,
    },
  };
}

/**
 * Relee la cuenta comprobando marca y ciclo de vida. Se llama en **cada** endpoint: el
 * `clientId` viene del portal, y el portal no es una frontera de confianza.
 */
async function requireClientAccount(brand: PortalBrand, clientId: string) {
  const account = await prisma.crmAccount.findUnique({ where: { id: clientId } });
  if (account === null) return null;
  if (account.lifecycle !== "CUSTOMER") return null;
  if (account.marca !== BRAND_TO_MARCA[brand]) return null;
  return account;
}

// ─── Bolsas de horas ───────────────────────────────────────────────────────────

export interface PortalHourBucketDto {
  id: string;
  code: string | null;
  label: string;
  projectName: string;
  contractedHours: number;
  consumedHours: number;
  remainingHours: number;
  usedRatio: number;
  alertRatio: number;
  status: BucketStatus;
  startDate: string | null;
  endDate: string | null;
  expiringSoon: boolean;
  /** Imputadas a esta bolsa con el parte aún sin aprobar. No restan saldo todavía. */
  pendingApprovalHours: number;
}

export interface PortalHourBucketsResponse {
  clientId: string;
  buckets: PortalHourBucketDto[];
  totals: {
    contractedHours: number;
    consumedHours: number;
    remainingHours: number;
    pendingApprovalHours: number;
  };
  /** Facturables que todavía no han caído en ninguna bolsa: el saldo es un techo. */
  pendingAttributionHours: number;
  accuracy: "EXACT" | "PENDING_REVIEW";
  computedAt: string | null;
  stale: boolean;
}

export async function getPortalHourBuckets(
  brand: PortalBrand,
  clientId: string,
): Promise<PortalHourBucketsResponse | null> {
  const account = await requireClientAccount(brand, clientId);
  if (account === null) return null;

  const projects = await prisma.jiraProject.findMany({
    where: { crmAccountId: clientId, active: true },
    include: {
      hourBuckets: {
        where: { active: true },
        include: { role: true, consumption: true },
      },
      hoursSnapshot: true,
    },
  });

  const hoy = today();
  const buckets: PortalHourBucketDto[] = [];
  let pendingAttributionHours = 0;
  let oldest: Date | null = null;
  let anyComputed = false;

  for (const project of projects) {
    pendingAttributionHours += project.hoursSnapshot?.pendingAttributionHours ?? 0;

    const computedAt = project.hoursSnapshot?.computedAt ?? null;
    if (computedAt !== null) {
      anyComputed = true;
      if (oldest === null || computedAt < oldest) oldest = computedAt;
    } else if (project.hourBuckets.length > 0) {
      // Un proyecto con bolsas y sin foto arrastra al conjunto a "viejo": su saldo no
      // se ha calculado nunca.
      oldest = new Date(0);
    }

    for (const bucket of project.hourBuckets) {
      const consumed = round2(bucket.consumption?.consumedHours ?? 0);
      const pendingApproval = round2(bucket.consumption?.pendingApprovalHours ?? 0);
      const startDate = bucket.startDate === null ? null : isoDay(bucket.startDate);
      const endDate = bucket.endDate === null ? null : isoDay(bucket.endDate);

      buckets.push({
        id: bucket.id,
        code: bucket.code,
        label: bucket.role.name,
        projectName: project.name,
        contractedHours: bucket.totalHours,
        consumedHours: consumed,
        remainingHours: round2(Math.max(bucket.totalHours - consumed, 0)),
        usedRatio: bucket.totalHours > 0 ? Math.round((consumed / bucket.totalHours) * 1000) / 1000 : 0,
        alertRatio: bucket.alertThreshold,
        status: bucketStatus({
          consumedHours: consumed,
          totalHours: bucket.totalHours,
          alertThreshold: bucket.alertThreshold,
          endDate,
          today: hoy,
        }),
        startDate,
        endDate,
        expiringSoon: isExpiringSoon(endDate, hoy),
        pendingApprovalHours: pendingApproval,
      });
    }
  }

  const totals = buckets.reduce(
    (acc, b) => ({
      contractedHours: acc.contractedHours + b.contractedHours,
      consumedHours: acc.consumedHours + b.consumedHours,
      remainingHours: acc.remainingHours + b.remainingHours,
      pendingApprovalHours: acc.pendingApprovalHours + b.pendingApprovalHours,
    }),
    { contractedHours: 0, consumedHours: 0, remainingHours: 0, pendingApprovalHours: 0 },
  );

  pendingAttributionHours = round2(pendingAttributionHours);

  return {
    clientId,
    buckets,
    totals: {
      contractedHours: round2(totals.contractedHours),
      consumedHours: round2(totals.consumedHours),
      remainingHours: round2(totals.remainingHours),
      pendingApprovalHours: round2(totals.pendingApprovalHours),
    },
    pendingAttributionHours,
    accuracy: pendingAttributionHours > 0 ? "PENDING_REVIEW" : "EXACT",
    computedAt: anyComputed && oldest !== null && oldest.getTime() > 0 ? oldest.toISOString() : null,
    stale: isStale(oldest !== null && oldest.getTime() > 0 ? oldest : null, snapshotStaleHours(), new Date()),
  };
}

// ─── Facturas y proformas ──────────────────────────────────────────────────────

export interface PortalInvoiceDto {
  id: string;
  number: string | null;
  date: string;
  dueDate: string | null;
  currency: string;
  total: number;
  paidAmount: number;
  pendingAmount: number;
  paymentStatus: PortalPaymentStatus;
}

export interface PortalProformaDto {
  id: string;
  number: string | null;
  date: string;
  dueDate: string | null;
  currency: string;
  total: number;
  status: "APPROVED" | "OVERDUE";
}

export interface PortalDocumentsResponse {
  clientId: string;
  invoices: PortalInvoiceDto[];
  proformas: PortalProformaDto[];
}

export const PORTAL_DOCUMENTS_MAX_LIMIT = 200;

export async function getPortalDocuments(
  brand: PortalBrand,
  clientId: string,
  limit: number,
): Promise<PortalDocumentsResponse | null> {
  const account = await requireClientAccount(brand, clientId);
  if (account === null) return null;

  // Sin contacto de Holded no hay por dónde cruzar: se devuelve vacío, no un error.
  if (account.companyId === null || account.holdedContactId === null) {
    return { clientId, invoices: [], proformas: [] };
  }
  const scope = { companyId: account.companyId, holdedContactId: account.holdedContactId };
  const take = Math.min(Math.max(limit, 1), PORTAL_DOCUMENTS_MAX_LIMIT);

  const [invoices, proformas] = await Promise.all([
    prisma.invoice.findMany({
      // SALE y solo SALE: las de compra son de proveedores nuestros.
      where: { ...scope, type: InvoiceType.SALE, removedFromHoldedAt: null },
      orderBy: { date: "desc" },
      take,
    }),
    prisma.proforma.findMany({
      where: { ...scope, holdedStatus: { in: PORTAL_VISIBLE_PROFORMA_STATUSES } },
      orderBy: { date: "desc" },
      take,
    }),
  ]);

  const hoy = today();

  return {
    clientId,
    invoices: invoices.map((inv) => {
      // El importe nativo, no `totalEur`: el cliente tiene que ver lo que se le facturó.
      const total = Number(inv.total);
      const paidAmount = Number(inv.paymentsTotal);
      const dueDate = inv.dueDate === null ? null : isoDay(inv.dueDate);
      return {
        id: inv.id,
        number: inv.number,
        date: isoDay(inv.date),
        dueDate,
        currency: inv.currency,
        total,
        paidAmount,
        pendingAmount: Number(inv.paymentsPending),
        paymentStatus: paymentStatus({ total, paidAmount, dueDate, today: hoy }),
      };
    }),
    proformas: proformas.map((pro) => ({
      id: pro.id,
      number: pro.number,
      date: isoDay(pro.date),
      dueDate: pro.dueDate === null ? null : isoDay(pro.dueDate),
      currency: pro.currency,
      total: Number(pro.total),
      status: proformaStatusLabel(pro.holdedStatus),
    })),
  };
}
