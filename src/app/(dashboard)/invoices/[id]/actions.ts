"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateInvoiceStatus } from "@/lib/sync";
import { AuditAction, ClassificationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

async function deriveMarcaFromLines(invoiceId: string): Promise<void> {
  const classifications = await prisma.classification.findMany({
    where: { invoiceLine: { invoiceId } },
    include: { project: { include: { workspace: true } } },
  });

  const marcas = [
    ...new Set(classifications.map((c) => c.project.workspace.name)),
  ].sort();

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { marca: marcas.length > 0 ? marcas.join(",") : null },
  });
}

export async function saveDraftLineNote({
  lineId,
  notes,
}: {
  lineId: string;
  notes: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.invoiceLine.update({
    where: { id: lineId },
    data: { notes: notes || null },
  });
}

export async function classifyLine({
  lineId,
  projectId,
  notes,
  invoiceId,
}: {
  lineId: string;
  projectId: string;
  notes: string;
  invoiceId: string;
}): Promise<{ classificationId: string }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.classification.findUnique({
    where: { invoiceLineId: lineId },
  });

  let classificationId: string;

  if (existing) {
    await prisma.classification.update({
      where: { invoiceLineId: lineId },
      data: {
        projectId,
        notes: notes || null,
        classifiedBy: session.user.email ?? session.user.id,
        classifiedAt: new Date(),
        status: ClassificationStatus.CLASSIFIED,
      },
    });
    classificationId = existing.id;

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: AuditAction.UPDATE,
        entityType: "Classification",
        entityId: existing.id,
        previousValue: { projectId: existing.projectId, notes: existing.notes },
        newValue: { projectId, notes },
        invoiceId,
        classificationId: existing.id,
      },
    });
  } else {
    const classification = await prisma.classification.create({
      data: {
        invoiceLineId: lineId,
        projectId,
        notes: notes || null,
        classifiedBy: session.user.email ?? session.user.id,
        classifiedAt: new Date(),
      },
    });
    classificationId = classification.id;

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: AuditAction.CLASSIFY,
        entityType: "Classification",
        entityId: classification.id,
        newValue: { projectId, notes },
        invoiceId,
        classificationId: classification.id,
      },
    });
  }

  await prisma.invoiceLine.update({
    where: { id: lineId },
    data: { notes: null },
  });

  await updateInvoiceStatus(invoiceId);
  await deriveMarcaFromLines(invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { classificationId };
}

export async function updateClassificationStatus({
  classificationId,
  status,
  invoiceId,
}: {
  classificationId: string;
  status: string;
  invoiceId: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const validStatus = ["CLASSIFIED", "APPROVED"] as const;
  if (!validStatus.includes(status as (typeof validStatus)[number])) {
    throw new Error("Invalid status");
  }

  const typedStatus = status as ClassificationStatus;

  const updateData: {
    status: ClassificationStatus;
    approvedBy?: string;
    approvedAt?: Date;
  } = { status: typedStatus };

  if (typedStatus === ClassificationStatus.APPROVED) {
    updateData.approvedBy = session.user.email ?? session.user.id;
    updateData.approvedAt = new Date();
  }

  await prisma.classification.update({
    where: { id: classificationId },
    data: updateData,
  });

  const action = AuditAction.APPROVE;

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action,
      entityType: "Classification",
      entityId: classificationId,
      newValue: { status },
      invoiceId,
      classificationId,
    },
  });

  await updateInvoiceStatus(invoiceId);
  await deriveMarcaFromLines(invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

export async function updateInvoiceAccountingMonth({
  invoiceId,
  month,
}: {
  invoiceId: string;
  month: string; // "YYYY-MM"
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const [year, mon] = month.split("-").map(Number);
  const accountingMonth = new Date(Date.UTC(year, mon - 1, 1));

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { accountingMonth },
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

export async function updateInvoiceMarca({
  invoiceId,
  marca,
}: {
  invoiceId: string;
  marca: string | null;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const previous = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { marca: true },
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { marca: marca ?? null },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "Invoice",
      entityId: invoiceId,
      previousValue: { marca: previous?.marca ?? null },
      newValue: { marca: marca ?? null },
      invoiceId,
    },
  });

  revalidatePath(`/invoices/${invoiceId}`);
}
