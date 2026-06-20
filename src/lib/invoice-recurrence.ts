import { InvoiceRecurrence, InvoiceType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MENSUAL_KEYWORDS =
  /mensual|mensalment|monthly|suscripci|subscripci|subscription|membership|retainer|fee\s*mensual/i;
const ANUAL_KEYWORDS =
  /anual|analment|annual|yearly|renewal|renovaci|domain|licencia\s*anual/i;

type InferenceDb = Pick<typeof prisma, "invoice">;

type InvoiceForInference = {
  id: string;
  type: InvoiceType;
  companyId: string;
  holdedContactId: string | null;
  counterparty: string | null;
  date: Date;
  totalEur: Prisma.Decimal | number;
  lines?: { name: string | null }[];
};

/**
 * Infiere la recurrencia de una factura de COMPRA comparándola con el histórico.
 *
 * Prioridad:
 *   1. Solo aplica a facturas PURCHASE → SALE devuelve null (sin inferencia)
 *   2. Keyword ANUAL en concepto/contraparte → ANUAL (tiene prioridad sobre keyword MENSUAL)
 *   3. ≥2 meses de los últimos 3 con importe ±10% → MENSUAL
 *   4. Keyword MENSUAL en concepto/contraparte → MENSUAL
 *   5. Año anterior ±2 meses con importe ±10% → ANUAL
 *   6. Default → PUNTUAL
 *
 * Nunca asigna EXTRAORDINARIO — ese valor es exclusivamente manual.
 * No sobreescribe recurrencias ya asignadas (el caller debe comprobarlo).
 */
export async function inferInvoiceRecurrence(
  db: InferenceDb,
  invoice: InvoiceForInference
): Promise<InvoiceRecurrence | null> {
  // Solo gastos
  if (invoice.type !== InvoiceType.PURCHASE) return null;

  const refAmount =
    typeof invoice.totalEur === "object" && "toNumber" in invoice.totalEur
      ? invoice.totalEur.toNumber()
      : Number(invoice.totalEur);

  // Sin importe o sin proveedor identificable → PUNTUAL
  if (refAmount <= 0 || (!invoice.holdedContactId && !invoice.counterparty)) {
    return InvoiceRecurrence.PUNTUAL;
  }

  // Texto para keyword detection: concepto de la 1ª línea + nombre de contraparte
  const conceptText = [
    invoice.lines?.[0]?.name ?? "",
    invoice.counterparty ?? "",
  ].join(" ");

  // ANUAL keyword tiene prioridad absoluta (ej. "Standard Yearly subscription" → ANUAL)
  if (ANUAL_KEYWORDS.test(conceptText)) return InvoiceRecurrence.ANUAL;

  const hasMensualKw = MENSUAL_KEYWORDS.test(conceptText);

  const min = refAmount * 0.9;
  const max = refAmount * 1.1;

  const counterpartyFilter: Prisma.InvoiceWhereInput = invoice.holdedContactId
    ? { holdedContactId: invoice.holdedContactId }
    : { counterparty: invoice.counterparty };

  const baseWhere: Prisma.InvoiceWhereInput = {
    companyId: invoice.companyId,
    type: InvoiceType.PURCHASE,
    id: { not: invoice.id },
    totalEur: { gte: min, lte: max },
    removedFromHoldedAt: null,
    ...counterpartyFilter,
  };

  function monthRange(
    date: Date,
    offset: number
  ): { gte: Date; lte: Date } {
    const gte = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1)
    );
    const lte = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0, 23, 59, 59)
    );
    return { gte, lte };
  }

  function yearWindow(date: Date): { gte: Date; lte: Date } {
    // Año anterior ±2 meses de margen
    const gte = new Date(
      Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth() - 2, 1)
    );
    const lte = new Date(
      Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth() + 3, 0, 23, 59, 59)
    );
    return { gte, lte };
  }

  // MENSUAL por patrón: ≥2 de {mes-1, mes-2, mes-3} con importe ±10%
  const [m1, m2, m3] = await Promise.all(
    [-1, -2, -3].map((o) =>
      db.invoice.findFirst({
        where: { ...baseWhere, date: monthRange(invoice.date, o) },
        select: { id: true },
      })
    )
  );
  const monthlyMatches = [m1, m2, m3].filter(Boolean).length;

  if (monthlyMatches >= 2 || hasMensualKw) return InvoiceRecurrence.MENSUAL;

  // ANUAL por patrón: mismo proveedor + importe ±10% en año-1 ±2 meses
  const a1 = await db.invoice.findFirst({
    where: { ...baseWhere, date: yearWindow(invoice.date) },
    select: { id: true },
  });
  if (a1) return InvoiceRecurrence.ANUAL;

  return InvoiceRecurrence.PUNTUAL;
}
