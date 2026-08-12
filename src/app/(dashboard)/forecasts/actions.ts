"use server";

import { prisma } from "@/lib/prisma";
import { ForecastType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";

type ForecastInput = {
  month: string;
  type: ForecastType;
  marca: string | null;
  projectId: string | null;
  accountMappingId: string | null;
  supplierId: string | null;
  description: string | null;
  amountOptimistic: number;
  amountPessimistic: number;
  isPaused?: boolean;
};

export async function createForecast(data: ForecastInput): Promise<void> {
  const session = await auth();
  const monthDate = new Date(`${data.month}-01T00:00:00.000Z`);

  await prisma.forecast.create({
    data: {
      month: monthDate,
      type: data.type,
      marca: data.marca ?? null,
      projectId: data.projectId ?? null,
      accountMappingId: data.accountMappingId ?? null,
      supplierId: data.supplierId ?? null,
      description: data.description ?? null,
      amountOptimistic: data.amountOptimistic,
      amountPessimistic: data.amountPessimistic,
      createdBy: session?.user?.email ?? null,
      updatedBy: session?.user?.email ?? null,
    },
  });
  revalidatePath("/forecasts");
  revalidatePath("/forecasts/manuales");
  revalidatePath("/cashflow");
}

export async function updateForecast(id: string, data: ForecastInput): Promise<void> {
  const session = await auth();
  const monthDate = new Date(`${data.month}-01T00:00:00.000Z`);

  await prisma.forecast.update({
    where: { id },
    data: {
      month: monthDate,
      type: data.type,
      marca: data.marca ?? null,
      projectId: data.projectId ?? null,
      accountMappingId: data.accountMappingId ?? null,
      supplierId: data.supplierId ?? null,
      description: data.description ?? null,
      amountOptimistic: data.amountOptimistic,
      amountPessimistic: data.amountPessimistic,
      ...(data.isPaused !== undefined ? { isPaused: data.isPaused } : {}),
      updatedBy: session?.user?.email ?? null,
    },
  });
  revalidatePath("/forecasts");
  revalidatePath("/forecasts/manuales");
  revalidatePath("/cashflow");
}

/** Alterna el flag de pausa de una previsión hija sin afectar a las demás ni a la recurrencia. */
export async function setForecastPaused(id: string, isPaused: boolean): Promise<void> {
  const session = await auth();
  await prisma.forecast.update({
    where: { id },
    data: { isPaused, updatedBy: session?.user?.email ?? null },
  });
  revalidatePath("/forecasts");
  revalidatePath("/forecasts/manuales");
  revalidatePath("/cashflow");
}

export async function deleteForecast(id: string): Promise<void> {
  await prisma.forecast.delete({ where: { id } });
  revalidatePath("/forecasts");
  revalidatePath("/forecasts/manuales");
  revalidatePath("/cashflow");
}
