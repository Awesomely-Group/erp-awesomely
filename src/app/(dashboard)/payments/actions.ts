"use server";

import { PaymentDirection } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function registerPayment({
  invoiceId,
  amount,
  paidAt,
  notes,
}: {
  invoiceId: string;
  amount: number;
  paidAt: string; // ISO date string
  notes: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.invoicePayment.create({
    data: {
      invoiceId,
      amount,
      paidAt: new Date(paidAt),
      paidBy: session.user.email ?? session.user.id ?? "unknown",
      notes: notes || null,
    },
  });

  revalidatePath("/payments");
}

export type ManualPaymentInput = {
  /** null ⇔ checkbox "Sin factura asociada" marcado en el formulario. */
  invoiceId: string | null;
  /** Fijado según la pestaña activa (Pagos → EXPENSE, Cobros → INCOME); no editable en el form. */
  direction: PaymentDirection;
  amount: number;
  /** Ligado a factura: fecha en la que se pagó (se registra como ya pagado, igual que
   * `registerPayment`). Suelto: fecha prevista de pago/cobro (queda pendiente). */
  date: string; // ISO date string
  notes: string;
  /** Solo relevantes (y persistidos) cuando invoiceId es null. */
  companyId: string | null;
  marca: string | null;
  accountMappingId: string | null;
};

/**
 * Registra un pago, ligado a una factura existente (mismo comportamiento que
 * `registerPayment`, para cualquier tipo de factura — SALE o PURCHASE, se crea ya como
 * pagado) o crea un pago PENDIENTE "suelto" (sin factura asociada, `paidAt` queda en
 * null) — este último exige una cuenta contable para poder clasificarlo en cashflow (ver
 * cashflowScopeConditions en src/lib/org.ts) y aparece mezclado en la misma lista de
 * Pagos/Cobros pendientes que las facturas hasta que se marca pagado con
 * `markManualPaymentPaid`. Los pagos ligados a factura no afectan a cashflow — su importe
 * ya se cuenta a través de la propia factura.
 */
export async function createManualPayment(input: ManualPaymentInput): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const isUnlinked = input.invoiceId === null;

  if (isUnlinked && !input.accountMappingId) {
    throw new Error("La cuenta contable es obligatoria para pagos sin factura asociada");
  }

  await prisma.invoicePayment.create({
    data: {
      invoiceId: input.invoiceId,
      amount: input.amount,
      paidAt: isUnlinked ? null : new Date(input.date),
      paidBy: isUnlinked ? null : (session.user.email ?? session.user.id ?? "unknown"),
      dueDate: isUnlinked ? new Date(input.date) : null,
      notes: input.notes || null,
      // Campos de clasificación: solo se persisten en la rama suelta — guarda de
      // seguridad server-side por si el cliente los envía junto a un invoiceId.
      direction: isUnlinked ? input.direction : null,
      companyId: isUnlinked ? input.companyId : null,
      marca: isUnlinked ? input.marca : null,
      accountMappingId: isUnlinked ? input.accountMappingId : null,
    },
  });

  revalidatePath("/payments");
  // Solo los pagos sueltos ya marcados como pagados afectan a cashflow, pero
  // revalidamos siempre — mismo criterio que forecasts/actions.ts ("hazlo siempre,
  // es barato").
  revalidatePath("/cashflow");
  revalidatePath("/forecasts"); // la página de forecasts también embebe el gráfico de cashflow
}

/**
 * Marca como pagado un pago manual "suelto" (creado sin factura asociada, pendiente desde
 * `createManualPayment`). A diferencia de `registerPayment` (que crea un nuevo registro de
 * pago contra una factura), aquí se actualiza el propio registro pendiente — no hay
 * factura de la que colgar un pago nuevo, el registro suelto ES el pago.
 */
export async function markManualPaymentPaid({
  id,
  paidAt,
  notes,
}: {
  id: string;
  paidAt: string; // ISO date string
  notes?: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.invoicePayment.update({
    where: { id, invoiceId: null },
    data: {
      paidAt: new Date(paidAt),
      paidBy: session.user.email ?? session.user.id ?? "unknown",
      ...(notes !== undefined ? { notes: notes || null } : {}),
    },
  });

  revalidatePath("/payments");
  revalidatePath("/cashflow");
  revalidatePath("/forecasts");
}

/**
 * Elimina un registro de pago del ERP — tanto ligado a una factura (uno de los
 * "Pagos registrados en ERP" de una fila, p.ej. creado con `registerPayment`) como
 * suelto/sin factura, pendiente o ya pagado (creado con `createManualPayment`). Sirve
 * para corregir un pago mal introducido (importe erróneo, factura equivocada, prueba…)
 * sin tener que tocar la BD a mano.
 */
export async function deletePayment(id: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.invoicePayment.delete({ where: { id } });

  revalidatePath("/payments");
  revalidatePath("/cashflow");
  revalidatePath("/forecasts");
}
