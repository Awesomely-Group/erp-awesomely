"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  BudgetType,
  BudgetRegion,
  BudgetStatus,
  BudgetTemplate,
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

export async function createHoldedQuote(budgetId: string): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    include: {
      company: true,
      lines: { orderBy: [{ phase: "asc" }, { sortOrder: "asc" }] },
    },
  });

  if (!budget) throw new Error("Budget not found");
  if (!budget.company) throw new Error("No company assigned to this budget");

  const client = new HoldedClient(budget.company.holdedApiKey);

  const products =
    budget.lines.length > 0
      ? budget.lines.map((l) => ({
          name: `${l.phase} — ${l.task}`,
          units: l.estimatedHours,
          price: Number(l.pvpPerHour),
          tax: 0,
        }))
      : [{ name: budget.name, units: 1, price: Number(budget.amount), tax: 0 }];

  const result = await client.createDocument("salesorder", {
    date: Math.floor(Date.now() / 1000),
    currency: budget.currency,
    desc: budget.name,
    notes: budget.notes ?? undefined,
    products,
  });

  await prisma.budget.update({
    where: { id: budgetId },
    data: { holdedDocId: result.id },
  });

  revalidatePath(`/budgets/${budgetId}`);
}

interface UpsertBudgetLinePayload {
  id?: string;
  budgetId: string;
  phase: string;
  task: string;
  roleId?: string | null;
  estimatedHours: number;
  pvpPerHour: number;
  costPerHour: number;
  sortOrder?: number;
}

export async function upsertBudgetLine(payload: UpsertBudgetLinePayload): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  if (payload.id) {
    await prisma.budgetLine.update({
      where: { id: payload.id },
      data: {
        phase: payload.phase,
        task: payload.task,
        roleId: payload.roleId ?? null,
        estimatedHours: payload.estimatedHours,
        pvpPerHour: payload.pvpPerHour,
        costPerHour: payload.costPerHour,
        sortOrder: payload.sortOrder ?? 0,
      },
    });
  } else {
    await prisma.budgetLine.create({
      data: {
        budgetId: payload.budgetId,
        phase: payload.phase,
        task: payload.task,
        roleId: payload.roleId ?? null,
        estimatedHours: payload.estimatedHours,
        pvpPerHour: payload.pvpPerHour,
        costPerHour: payload.costPerHour,
        sortOrder: payload.sortOrder ?? 0,
      },
    });
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
