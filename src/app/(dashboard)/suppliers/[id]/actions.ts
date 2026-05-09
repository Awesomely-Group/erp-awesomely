"use server";

import { prisma } from "@/lib/prisma";
import { TempoClient } from "@/lib/tempo";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createVerification(
  supplierId: string,
  periodStart: string,
  periodEnd: string,
  roleId?: string,
): Promise<void> {
  await prisma.supplierVerification.create({
    data: {
      supplierId,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      ...(roleId ? { roleId } : {}),
    },
  });
  revalidatePath(`/suppliers/${supplierId}`);
}

export async function captureTempoHours(verificationId: string): Promise<void> {
  const verification = await prisma.supplierVerification.findUniqueOrThrow({
    where: { id: verificationId },
    include: { supplier: true, role: true },
  });

  const { supplier } = verification;
  if (!supplier.jiraAccountId) throw new Error("El proveedor no tiene Jira Account ID configurado");

  const workspace = await prisma.jiraWorkspace.findFirst({
    where: { tempoApiToken: { not: null } },
  });
  if (!workspace?.tempoApiToken) throw new Error("No hay token de Tempo configurado");

  const tempoClient = new TempoClient(workspace.tempoApiToken);
  const from = verification.periodStart.toISOString().slice(0, 10);
  const to = verification.periodEnd.toISOString().slice(0, 10);

  const result = await tempoClient.getApprovedHours(supplier.jiraAccountId, from, to);

  const rate = verification.role?.ratePerHour != null
    ? Number(verification.role.ratePerHour)
    : supplier.hourlyRate != null
      ? Number(supplier.hourlyRate)
      : null;

  const expectedAmount = rate != null
    ? Math.round(result.approvedHours * rate * 100) / 100
    : null;

  await prisma.supplierVerification.update({
    where: { id: verificationId },
    data: {
      tempoHours: result.approvedHours,
      expectedAmount,
      capturedAt: new Date(),
      status: "HOURS_CAPTURED",
      notes: result.usedFallback
        ? "Aviso: la API de Approvals de Tempo no está disponible; se han usado todos los worklogs del período sin filtrar por aprobación."
        : null,
    },
  });

  revalidatePath(`/suppliers/${verification.supplierId}`);
}

export async function linkInvoice(
  verificationId: string,
  invoiceId: string,
  serviceStart: string,
  serviceEnd: string,
): Promise<void> {
  const [verification, invoice] = await Promise.all([
    prisma.supplierVerification.findUniqueOrThrow({ where: { id: verificationId } }),
    prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } }),
  ]);

  const serviceStartDate = new Date(serviceStart);
  const serviceEndDate = new Date(serviceEnd);

  const periodMismatch =
    serviceEndDate < verification.periodStart || serviceStartDate > verification.periodEnd;

  await prisma.supplierVerification.update({
    where: { id: verificationId },
    data: {
      invoiceId,
      invoicedAmount: Number(invoice.totalEur),
      invoiceServicePeriodStart: serviceStartDate,
      invoiceServicePeriodEnd: serviceEndDate,
      periodMismatch,
      status: "INVOICE_RECEIVED",
    },
  });

  revalidatePath(`/suppliers/${verification.supplierId}`);
}

export async function verifyPeriod(verificationId: string): Promise<void> {
  const session = await auth();
  const verification = await prisma.supplierVerification.findUniqueOrThrow({
    where: { id: verificationId },
  });

  let status: "PERIOD_MISMATCH" | "VERIFIED_MISMATCH" | "VERIFIED_OK";

  if (verification.periodMismatch === true) {
    status = "PERIOD_MISMATCH";
  } else if (
    verification.invoicedAmount != null &&
    verification.expectedAmount != null &&
    Math.abs(Number(verification.invoicedAmount) - Number(verification.expectedAmount)) > 0.01
  ) {
    status = "VERIFIED_MISMATCH";
  } else {
    status = "VERIFIED_OK";
  }

  await prisma.supplierVerification.update({
    where: { id: verificationId },
    data: {
      status,
      verifiedAt: new Date(),
      verifiedBy: session?.user?.email ?? "unknown",
    },
  });

  revalidatePath(`/suppliers/${verification.supplierId}`);
}

export async function relinkInvoice(verificationId: string): Promise<void> {
  const verification = await prisma.supplierVerification.findUniqueOrThrow({
    where: { id: verificationId },
  });

  await prisma.supplierVerification.update({
    where: { id: verificationId },
    data: {
      invoiceId: null,
      invoicedAmount: null,
      invoiceServicePeriodStart: null,
      invoiceServicePeriodEnd: null,
      periodMismatch: null,
      status: "HOURS_CAPTURED",
      verifiedAt: null,
      verifiedBy: null,
    },
  });

  revalidatePath(`/suppliers/${verification.supplierId}`);
}

export async function saveNotes(verificationId: string, notes: string): Promise<void> {
  const verification = await prisma.supplierVerification.findUniqueOrThrow({
    where: { id: verificationId },
  });

  await prisma.supplierVerification.update({
    where: { id: verificationId },
    data: { notes },
  });

  revalidatePath(`/suppliers/${verification.supplierId}`);
}

export async function approveForPayment(verificationId: string): Promise<void> {
  const verification = await prisma.supplierVerification.findUniqueOrThrow({
    where: { id: verificationId },
  });

  await prisma.supplierVerification.update({
    where: { id: verificationId },
    data: { status: "APPROVED" },
  });

  revalidatePath(`/suppliers/${verification.supplierId}`);
}

// ─── Role management ───────────────────────────────────────────────────────────

export async function createRole(
  supplierId: string,
  name: string,
  ratePerHour: string,
): Promise<void> {
  const rate = parseFloat(ratePerHour);
  if (isNaN(rate) || rate <= 0) throw new Error("Tarifa inválida");
  await prisma.supplierRole.create({
    data: { supplierId, name: name.trim(), ratePerHour: rate },
  });
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
}

export async function updateRole(
  roleId: string,
  supplierId: string,
  name: string,
  ratePerHour: string,
): Promise<void> {
  const rate = parseFloat(ratePerHour);
  if (isNaN(rate) || rate <= 0) throw new Error("Tarifa inválida");
  await prisma.supplierRole.update({
    where: { id: roleId },
    data: { name: name.trim(), ratePerHour: rate },
  });
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
}

export async function deleteRole(roleId: string, supplierId: string): Promise<void> {
  await prisma.supplierRole.update({
    where: { id: roleId },
    data: { active: false },
  });
  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
}
