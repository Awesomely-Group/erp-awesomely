import { ForecastFrequency } from "@prisma/client";
import { addDays, addWeeks, addMonths, addYears } from "date-fns";

/** Límite máximo de ocurrencias generadas por frecuencia, para evitar crear miles de filas por error. */
export const MAX_OCCURRENCES: Record<ForecastFrequency, number> = {
  DAILY: 366,
  WEEKLY: 260,
  MONTHLY: 60,
  YEARLY: 20,
};

function addByFrequency(date: Date, frequency: ForecastFrequency, count: number): Date {
  switch (frequency) {
    case ForecastFrequency.DAILY:
      return addDays(date, count);
    case ForecastFrequency.WEEKLY:
      return addWeeks(date, count);
    case ForecastFrequency.MONTHLY:
      return addMonths(date, count);
    case ForecastFrequency.YEARLY:
      return addYears(date, count);
  }
}

/**
 * Calcula las fechas de ocurrencia de una recurrencia. Exactamente uno de `endDate` u
 * `occurrences` debe estar presente (XOR), validado por el caller.
 */
export function calculateOccurrenceDates(
  startDate: Date,
  frequency: ForecastFrequency,
  endDate: Date | null,
  occurrences: number | null
): Date[] {
  const dates: Date[] = [];
  const max = MAX_OCCURRENCES[frequency];

  if (occurrences !== null) {
    for (let i = 0; i < occurrences; i++) {
      dates.push(addByFrequency(startDate, frequency, i));
    }
    return dates;
  }

  if (endDate !== null) {
    let i = 0;
    while (true) {
      const next = addByFrequency(startDate, frequency, i);
      if (next > endDate) break;
      dates.push(next);
      i++;
      if (i > max + 1) break; // salvaguarda adicional, el límite real se valida aparte
    }
    return dates;
  }

  return dates;
}
