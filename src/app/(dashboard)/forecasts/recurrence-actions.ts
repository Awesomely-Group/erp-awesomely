"use server";

import { prisma } from "@/lib/prisma";
import { ForecastFrequency, ForecastType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { MAX_OCCURRENCES, calculateOccurrenceDates } from "@/lib/forecast-recurrence";

type ForecastRecurrenceInput = {
  frequency: ForecastFrequency;
  startDate: string; // yyyy-MM-dd
  endDate: string | null;
  occurrences: number | null;
  type: ForecastType;
  marca: string | null;
  projectId: string | null;
  accountMappingId: string | null;
  supplierId: string | null;
  description: string | null;
  amount: number;
};

export async function createForecastRecurrence(
  input: ForecastRecurrenceInput
): Promise<{ success: true; count: number } | { success: false; error: string }> {
  if ((!input.endDate && input.occurrences === null) || (input.endDate && input.occurrences !== null)) {
    return { success: false, error: "Debes indicar una fecha de fin O un número de ocurrencias, no ambos ni ninguno." };
  }

  const startDate = new Date(`${input.startDate}T00:00:00.000Z`);
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null;

  const dates = calculateOccurrenceDates(startDate, input.frequency, endDate, input.occurrences);

  if (dates.length === 0) {
    return { success: false, error: "El rango indicado no genera ninguna previsión." };
  }

  const max = MAX_OCCURRENCES[input.frequency];
  if (dates.length > max) {
    return {
      success: false,
      error: `Se generarían ${dates.length} previsiones, por encima del límite de ${max} para frecuencia ${input.frequency.toLowerCase()}.`,
    };
  }

  const session = await auth();
  const userEmail = session?.user?.email ?? null;

  await prisma.$transaction(async (tx) => {
    const recurrence = await tx.forecastRecurrence.create({
      data: {
        frequency: input.frequency,
        startDate,
        endDate,
        occurrences: input.occurrences,
        type: input.type,
        marca: input.marca ?? null,
        projectId: input.projectId ?? null,
        accountMappingId: input.accountMappingId ?? null,
        supplierId: input.supplierId ?? null,
        description: input.description ?? null,
        amountOptimistic: input.amount,
        amountPessimistic: input.amount,
        createdBy: userEmail,
        updatedBy: userEmail,
      },
    });

    await tx.forecast.createMany({
      data: dates.map((month) => ({
        month,
        type: input.type,
        marca: input.marca ?? null,
        projectId: input.projectId ?? null,
        accountMappingId: input.accountMappingId ?? null,
        supplierId: input.supplierId ?? null,
        description: input.description ?? null,
        amountOptimistic: input.amount,
        amountPessimistic: input.amount,
        recurrenceId: recurrence.id,
        createdBy: userEmail,
        updatedBy: userEmail,
      })),
    });
  });

  revalidatePath("/forecasts");
  revalidatePath("/cashflow");

  return { success: true, count: dates.length };
}

/** Borra la plantilla de recurrencia; los hijos se borran en cascada vía FK (`onDelete: Cascade`). */
export async function deleteForecastRecurrence(id: string): Promise<void> {
  await prisma.forecastRecurrence.delete({ where: { id } });
  revalidatePath("/forecasts");
  revalidatePath("/cashflow");
}
