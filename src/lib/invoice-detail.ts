import type { Prisma } from "@prisma/client";
import { holdedInvoiceUrl } from "./utils";

/**
 * Detalle de una factura del ERP en JSON, para poder cargarlo bajo demanda desde
 * el cliente (hoy el detalle solo era accesible desde un Server Component vía
 * Prisma).
 *
 * Contrato: los Decimal de Prisma se exponen como `number` y los DateTime como
 * ISO string, igual que ya hace la pantalla de Pagos con sus filas.
 */

export interface InvoiceDetailLine {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  tax: number;
  total: number;
  totalEur: number;
  accountingAccount: string | null;
  accountingAccountName: string | null;
}

export interface InvoiceDetail {
  id: string;
  holdedId: string;
  holdedUrl: string;
  type: "PURCHASE" | "SALE";
  number: string | null;
  counterparty: string | null;
  companyName: string;
  date: string;
  dueDate: string | null;
  currency: string;
  fxRateToEur: number;
  subtotal: number;
  tax: number;
  total: number;
  totalEur: number;
  paymentsTotal: number;
  paymentsPending: number;
  status: string;
  marca: string | null;
  removedFromHoldedAt: string | null;
  lines: InvoiceDetailLine[];
}

export const invoiceDetailSelect = {
  id: true,
  holdedId: true,
  type: true,
  number: true,
  counterparty: true,
  date: true,
  dueDate: true,
  currency: true,
  fxRateToEur: true,
  subtotal: true,
  tax: true,
  total: true,
  totalEur: true,
  paymentsTotal: true,
  paymentsPending: true,
  status: true,
  marca: true,
  removedFromHoldedAt: true,
  company: { select: { name: true } },
  lines: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      quantity: true,
      unitPrice: true,
      subtotal: true,
      tax: true,
      total: true,
      totalEur: true,
      accountingAccount: true,
      accountingAccountName: true,
    },
  },
} satisfies Prisma.InvoiceSelect;

export type InvoiceDetailRow = Prisma.InvoiceGetPayload<{
  select: typeof invoiceDetailSelect;
}>;

export function toInvoiceDetail(row: InvoiceDetailRow): InvoiceDetail {
  return {
    id: row.id,
    holdedId: row.holdedId,
    holdedUrl: holdedInvoiceUrl(row.holdedId, row.type),
    type: row.type,
    number: row.number,
    counterparty: row.counterparty,
    companyName: row.company.name,
    date: row.date.toISOString(),
    dueDate: row.dueDate?.toISOString() ?? null,
    currency: row.currency,
    fxRateToEur: Number(row.fxRateToEur),
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    total: Number(row.total),
    totalEur: Number(row.totalEur),
    paymentsTotal: Number(row.paymentsTotal),
    paymentsPending: Number(row.paymentsPending),
    status: row.status,
    marca: row.marca,
    removedFromHoldedAt: row.removedFromHoldedAt?.toISOString() ?? null,
    lines: row.lines.map((line) => ({
      id: line.id,
      name: line.name,
      description: line.description,
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
      subtotal: Number(line.subtotal),
      tax: Number(line.tax),
      total: Number(line.total),
      totalEur: Number(line.totalEur),
      accountingAccount: line.accountingAccount,
      accountingAccountName: line.accountingAccountName,
    })),
  };
}
