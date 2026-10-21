import type { CrmOrigin } from "@prisma/client";

/**
 * Normalización y validación de los datos editables de una oportunidad.
 *
 * Vive aquí, fuera de la server action, por dos razones: es lógica pura y se puede
 * probar sin base de datos (ver crm-deal-input.test.ts), y la regla de qué es un
 * importe o una probabilidad válidos tiene que ser la misma venga la escritura de
 * donde venga.
 *
 * Cada campo es opcional y se distingue "no lo toques" (undefined) de "déjalo vacío"
 * (null), que es lo que permite borrar un origen o una fecha ya puestos.
 */
export interface DealFieldInput {
  name?: string;
  amount?: number | null;
  probability?: number | null;
  expectedCloseDate?: string | null;
  origin?: CrmOrigin | null;
  market?: string | null;
  seats?: number | null;
  notes?: string | null;
}

/** Solo las claves que venían en la entrada, listas para el `data` de Prisma. */
export type DealFieldUpdates = {
  name?: string;
  amount?: number | null;
  probability?: number | null;
  expectedCloseDate?: Date | null;
  origin?: CrmOrigin | null;
  market?: string | null;
  seats?: number | null;
  notes?: string | null;
};

export function normalizeDealFields(input: DealFieldInput): DealFieldUpdates {
  const updates: DealFieldUpdates = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("La oportunidad necesita un nombre");
    updates.name = name;
  }

  if (input.amount !== undefined) {
    if (input.amount !== null && (!Number.isFinite(input.amount) || input.amount < 0)) {
      throw new Error("El importe tiene que ser un número ≥ 0");
    }
    updates.amount = input.amount;
  }

  if (input.probability !== undefined) {
    if (
      input.probability !== null &&
      (!Number.isInteger(input.probability) || input.probability < 0 || input.probability > 100)
    ) {
      throw new Error("La probabilidad es un porcentaje entero entre 0 y 100");
    }
    updates.probability = input.probability;
  }

  if (input.expectedCloseDate !== undefined) {
    if (input.expectedCloseDate === null || input.expectedCloseDate.trim() === "") {
      updates.expectedCloseDate = null;
    } else {
      const date = new Date(input.expectedCloseDate);
      if (Number.isNaN(date.getTime())) throw new Error("La fecha de cierre no es válida");
      updates.expectedCloseDate = date;
    }
  }

  if (input.seats !== undefined) {
    if (input.seats !== null && (!Number.isInteger(input.seats) || input.seats < 0)) {
      throw new Error("Los usuarios/seats son un número entero ≥ 0");
    }
    updates.seats = input.seats;
  }

  if (input.origin !== undefined) updates.origin = input.origin;

  // Un texto en blanco es ausencia de dato, no un dato vacío: así "—" significa
  // siempre lo mismo mire quien lo mire.
  if (input.market !== undefined) updates.market = input.market?.trim() || null;
  if (input.notes !== undefined) updates.notes = input.notes?.trim() || null;

  return updates;
}
