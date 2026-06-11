"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  BudgetType,
  BudgetRegion,
  BudgetStatus,
  BudgetTemplate,
  BudgetLineType,
  PaymentTermValueType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { HoldedClient } from "@/lib/holded";

interface CreateBudgetPayload {
  projectId: string;
  name: string;
  type: BudgetType;
  region: BudgetRegion;
  amount: number;
  currency: string;
  estimatedHours?: number | null;
  monthlyFee?: number | null;
  template: BudgetTemplate;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  companyId?: string | null;
  clientName?: string | null;
  holdedContactId?: string | null;
}

export async function createBudget(payload: CreateBudgetPayload): Promise<{ id: string }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const budget = await prisma.budget.create({
    data: {
      projectId: payload.projectId,
      name: payload.name,
      type: payload.type,
      region: payload.region,
      amount: payload.amount,
      currency: payload.currency,
      estimatedHours: payload.estimatedHours ?? null,
      monthlyFee: payload.monthlyFee ?? null,
      template: payload.template,
      startDate: payload.startDate ? new Date(payload.startDate) : null,
      endDate: payload.endDate ? new Date(payload.endDate) : null,
      notes: payload.notes ?? null,
      companyId: payload.companyId ?? null,
      clientName: payload.clientName ?? null,
      holdedContactId: payload.holdedContactId ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/budgets");
  return budget;
}

export async function updateBudgetStatus(
  budgetId: string,
  status: BudgetStatus
): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.budget.update({ where: { id: budgetId }, data: { status } });
  revalidatePath("/budgets");
  revalidatePath(`/budgets/${budgetId}`);
}

export async function createHoldedQuote(budgetId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: {
      company: true,
      project: { select: { name: true } },
      lines: { orderBy: [{ phase: "asc" }, { sortOrder: "asc" }] },
    },
  });

  if (!budget) return { error: "Presupuesto no encontrado" };
  if (!budget.company) return { error: "No hay empresa asignada a este presupuesto" };

  const client = new HoldedClient(budget.company.holdedApiKey);

  let result: { id: string };
  try {
    result = await client.createDocument("estimate", {
      date: Math.floor(Date.now() / 1000),
      ...(budget.holdedContactId
        ? { contactId: budget.holdedContactId }
        : { contactName: budget.clientName ?? budget.project.name }),
      currency: budget.currency,
      notes: budget.notes ?? undefined,
      products: buildHoldedProducts(budget),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al crear el documento en Holded";
    return { error: msg };
  }

  await prisma.budget.update({
    where: { id: budgetId },
    data: { holdedDocId: result.id, holdedSyncedAt: new Date() },
  });

  revalidatePath(`/budgets/${budgetId}`);
  return {};
}

function buildHoldedProducts(budget: {
  lines: {
    lineType: BudgetLineType;
    phase: string | null;
    task: string | null;
    estimatedHours: number | null;
    pvpPerHour: unknown;
    concept: string | null;
    quantity: unknown;
    unitPrice: unknown;
  }[];
  name: string;
  amount: unknown;
}): Array<{ name: string; units: number; price: number; subtotal: number }> {
  if (budget.lines.length > 0) {
    return budget.lines.map((l) => {
      if (l.lineType === "ACTIVIDAD") {
        const units = Number(l.quantity ?? 1);
        const price = Number(l.unitPrice ?? 0);
        return { name: l.concept ?? budget.name, units, price, subtotal: units * price };
      }
      const units = l.estimatedHours ?? 0;
      const price = Number(l.pvpPerHour ?? 0);
      return { name: `${l.phase ?? ""} — ${l.task ?? ""}`, units, price, subtotal: units * price };
    });
  }
  const p = Number(budget.amount);
  return [{ name: budget.name, units: 1, price: p, subtotal: p }];
}

export async function syncHoldedQuote(budgetId: string): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Unauthorized" };

  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: {
      company: true,
      project: { select: { name: true } },
      lines: { orderBy: [{ phase: "asc" }, { sortOrder: "asc" }] },
    },
  });

  if (!budget) return { error: "Presupuesto no encontrado" };
  if (!budget.company) return { error: "No hay empresa asignada a este presupuesto" };
  if (!budget.holdedDocId) return { error: "El presupuesto no tiene documento en Holded" };

  const client = new HoldedClient(budget.company.holdedApiKey);

  try {
    await client.updateDocument("estimate", budget.holdedDocId, {
      date: Math.floor(Date.now() / 1000),
      ...(budget.holdedContactId
        ? { contactId: budget.holdedContactId }
        : { contactName: budget.clientName ?? budget.project.name }),
      currency: budget.currency,
      notes: budget.notes ?? undefined,
      products: buildHoldedProducts(budget),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error al actualizar el documento en Holded";
    return { error: msg };
  }

  await prisma.budget.update({
    where: { id: budgetId },
    data: { holdedSyncedAt: new Date() },
  });

  revalidatePath(`/budgets/${budgetId}`);
  return {};
}

interface UpdateBudgetPayload {
  id: string;
  name: string;
  type: BudgetType;
  region: BudgetRegion;
  amount: number;
  currency: string;
  estimatedHours?: number | null;
  monthlyFee?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  companyId?: string | null;
  clientName?: string | null;
}

export async function updateBudget(payload: UpdateBudgetPayload): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.budget.update({
    where: { id: payload.id },
    data: {
      name: payload.name,
      type: payload.type,
      region: payload.region,
      amount: payload.amount,
      currency: payload.currency,
      estimatedHours: payload.estimatedHours ?? null,
      monthlyFee: payload.monthlyFee ?? null,
      startDate: payload.startDate ? new Date(payload.startDate) : null,
      endDate: payload.endDate ? new Date(payload.endDate) : null,
      notes: payload.notes ?? null,
      companyId: payload.companyId ?? null,
      clientName: payload.clientName ?? null,
    },
  });

  revalidatePath(`/budgets/${payload.id}`);
  revalidatePath("/budgets");
}

export async function deleteBudget(budgetId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.budget.delete({ where: { id: budgetId } });
  revalidatePath("/budgets");
}

interface UpsertBudgetLinePayload {
  id?: string;
  budgetId: string;
  lineType: BudgetLineType;
  // ROL
  phase?: string | null;
  task?: string | null;
  roleId?: string | null;
  estimatedHours?: number | null;
  pvpPerHour?: number | null;
  costPerHour?: number | null;
  // ACTIVIDAD
  concept?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  sortOrder?: number;
}

export async function upsertBudgetLine(payload: UpsertBudgetLinePayload): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const data = {
    lineType: payload.lineType,
    phase: payload.phase ?? null,
    task: payload.task ?? null,
    roleId: payload.roleId ?? null,
    estimatedHours: payload.estimatedHours ?? null,
    pvpPerHour: payload.pvpPerHour ?? null,
    costPerHour: payload.costPerHour ?? null,
    concept: payload.concept ?? null,
    quantity: payload.quantity ?? null,
    unitPrice: payload.unitPrice ?? null,
    sortOrder: payload.sortOrder ?? 0,
  };

  if (payload.id) {
    await prisma.budgetLine.update({ where: { id: payload.id }, data });
  } else {
    await prisma.budgetLine.create({ data: { budgetId: payload.budgetId, ...data } });
  }

  revalidatePath(`/budgets/${payload.budgetId}`);
}

export async function deleteBudgetLine(lineId: string, budgetId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.budgetLine.delete({ where: { id: lineId } });
  revalidatePath(`/budgets/${budgetId}`);
}

interface UpsertPaymentTermPayload {
  id?: string;
  budgetId: string;
  order: number;
  valueType: PaymentTermValueType;
  value: number;
  dueDate?: string | null;
  description?: string | null;
}

export async function upsertPaymentTerm(payload: UpsertPaymentTermPayload): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (payload.id) {
    await prisma.paymentTerm.update({
      where: { id: payload.id },
      data: {
        order: payload.order,
        valueType: payload.valueType,
        value: payload.value,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        description: payload.description ?? null,
      },
    });
  } else {
    await prisma.paymentTerm.create({
      data: {
        budgetId: payload.budgetId,
        order: payload.order,
        valueType: payload.valueType,
        value: payload.value,
        dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
        description: payload.description ?? null,
      },
    });
  }

  revalidatePath(`/budgets/${payload.budgetId}`);
}

export async function deletePaymentTerm(termId: string, budgetId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  await prisma.paymentTerm.delete({ where: { id: termId } });
  revalidatePath(`/budgets/${budgetId}`);
}
