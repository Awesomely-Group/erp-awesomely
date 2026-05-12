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
  description: string | null;
  amountOptimistic: number;
  amountPessimistic: number;
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
      description: data.description ?? null,
      amountOptimistic: data.amountOptimistic,
      amountPessimistic: data.amountPessimistic,
      createdBy: session?.user?.email ?? null,
      updatedBy: session?.user?.email ?? null,
    },
  });
  revalidatePath("/forecasts");
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
      description: data.description ?? null,
      amountOptimistic: data.amountOptimistic,
      amountPessimistic: data.amountPessimistic,
      updatedBy: session?.user?.email ?? null,
    },
  });
  revalidatePath("/forecasts");
  revalidatePath("/cashflow");
}

export async function deleteForecast(id: string): Promise<void> {
  await prisma.forecast.delete({ where: { id } });
  revalidatePath("/forecasts");
  revalidatePath("/cashflow");
}
