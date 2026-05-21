"use server";

import { auth } from "@/lib/auth";
import { deriveMarcaFromClassifications } from "@/lib/invoice-marca";
import { prisma } from "@/lib/prisma";
import { updateInvoiceStatus } from "@/lib/sync";
import { AuditAction, ClassificationStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

async function deriveMarcaFromLines(invoiceId: string): Promise<void> {
  const classifications = await prisma.classification.findMany({
    where: { invoiceLine: { invoiceId } },
    include: { project: { include: { workspace: true } } },
  });

  const marca = deriveMarcaFromClassifications(classifications);

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { marca },
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
  marca,
  notes,
  invoiceId,
}: {
  lineId: string;
  projectId: string | null;
  marca: string | null;
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
        marca: marca ?? null,
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
        newValue: { projectId, marca, notes },
        invoiceId,
        classificationId: existing.id,
      },
    });
  } else {
    const classification = await prisma.classification.create({
      data: {
        invoiceLineId: lineId,
        projectId,
        marca: marca ?? null,
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
        newValue: { projectId, marca, notes },
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

  await updateInvoiceStatus(invoiceId);

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

export async function bulkUpdateInvoiceMarca({
  invoiceIds,
  marca,
}: {
  invoiceIds: string[];
  marca: string | null;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (invoiceIds.length === 0) return;

  await prisma.invoice.updateMany({
    where: { id: { in: invoiceIds } },
    data: { marca: marca ?? null },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "Invoice",
      entityId: invoiceIds[0],
      previousValue: { bulk: true, count: invoiceIds.length },
      newValue: { marca: marca ?? null, invoiceIds },
    },
  });

  await Promise.all(invoiceIds.map((id) => updateInvoiceStatus(id)));

  revalidatePath("/invoices");
}

export async function bulkUpdateInvoiceProject({
  invoiceIds,
  projectId,
}: {
  invoiceIds: string[];
  projectId: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  if (invoiceIds.length === 0) return;

  const project = await prisma.jiraProject.findUniqueOrThrow({
    where: { id: projectId },
    include: { workspace: true },
  });
  const marca = project.workspace.name;

  const lines = await prisma.invoiceLine.findMany({
    where: { invoiceId: { in: invoiceIds } },
    select: { id: true, invoiceId: true },
  });

  for (const line of lines) {
    await prisma.classification.upsert({
      where: { invoiceLineId: line.id },
      create: {
        invoiceLineId: line.id,
        projectId,
        marca,
        classifiedBy: session.user.email ?? session.user.id,
        classifiedAt: new Date(),
        status: ClassificationStatus.CLASSIFIED,
      },
      update: {
        projectId,
        marca,
        classifiedBy: session.user.email ?? session.user.id,
        classifiedAt: new Date(),
        status: ClassificationStatus.CLASSIFIED,
      },
    });
  }

  for (const invoiceId of invoiceIds) {
    await updateInvoiceStatus(invoiceId);
    await deriveMarcaFromLines(invoiceId);
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.UPDATE,
      entityType: "Invoice",
      entityId: invoiceIds[0],
      previousValue: { bulk: true, count: invoiceIds.length },
      newValue: { projectId, invoiceIds },
    },
  });

  revalidatePath("/invoices");
}
