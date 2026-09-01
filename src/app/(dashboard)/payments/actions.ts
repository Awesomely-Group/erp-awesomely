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
  paidAt: string; // ISO date string
  notes: string;
  /** Solo relevantes (y persistidos) cuando invoiceId es null. */
  companyId: string | null;
  marca: string | null;
  accountMappingId: string | null;
};

/**
 * Registra un pago manual, ligado a una factura existente (mismo comportamiento que
 * `registerPayment`, para cualquier tipo de factura — SALE o PURCHASE) o "suelto" (sin
 * factura asociada), en cuyo caso se exige una cuenta contable para poder clasificarlo en
 * cashflow (ver cashflowScopeConditions en src/lib/org.ts y la nueva consulta de
 * `invoice_payments` en src/lib/cashflow-data.ts). Los pagos ligados a factura no afectan
 * a cashflow — su importe ya se cuenta a través de la propia factura.
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
      paidAt: new Date(input.paidAt),
      paidBy: session.user.email ?? session.user.id ?? "unknown",
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
  // Solo los pagos sueltos afectan a cashflow, pero revalidamos siempre — mismo
  // criterio que forecasts/actions.ts ("hazlo siempre, es barato").
  revalidatePath("/cashflow");
  revalidatePath("/forecasts"); // la página de forecasts también embebe el gráfico de cashflow
}
