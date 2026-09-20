/**
 * Piezas puras de la API del portal de cliente: derivaciones que el cliente ve y que,
 * por tanto, conviene tener clavadas con tests en vez de enterradas en un route handler
 * (el repo no tiene tests de rutas: lo que se quiera cubrir sale como función pura).
 */

export type PortalPaymentStatus = "PAID" | "PARTIAL" | "PENDING" | "OVERDUE";

/**
 * Estado de cobro tal y como debe leerlo el cliente.
 *
 * `OVERDUE` pesa más que `PARTIAL`: una factura medio pagada y vencida está vencida, y
 * enseñarla como "parcial" le quitaría la urgencia que es justo el motivo de enseñarla.
 */
export function paymentStatus(args: {
  total: number;
  paidAmount: number;
  dueDate: string | null;
  today: string;
}): PortalPaymentStatus {
  const { total, paidAmount, dueDate, today } = args;

  // Con tolerancia de un céntimo: los redondeos de Holded no deben dejar una factura
  // cobrada marcada como pendiente de 0,004 €.
  if (paidAmount >= total - 0.01) return "PAID";
  if (dueDate !== null && dueDate < today) return "OVERDUE";
  if (paidAmount > 0) return "PARTIAL";
  return "PENDING";
}

/**
 * Proformas que un cliente puede ver. Códigos de `src/lib/proforma-status.ts`.
 *
 * Solo 2 (Aprobado) y 4 (Vencida). Quedan fuera:
 *  - 0 y 1 (Borrador): son trabajo interno nuestro, no puede llegarle a nadie;
 *  - -1 (Cancelada): no significa nada para él;
 *  - 3 (Facturado): ya existe su factura, y listar las dos le haría creer que debe el
 *    doble.
 */
export const PORTAL_VISIBLE_PROFORMA_STATUSES = [2, 4];

export function proformaStatusLabel(holdedStatus: number | null): "APPROVED" | "OVERDUE" {
  return holdedStatus === 4 ? "OVERDUE" : "APPROVED";
}

/** Una foto vieja tiene que verse como vieja, nunca pasar por recién calculada. */
export function isStale(computedAt: Date | null, staleHours: number, now: Date): boolean {
  if (computedAt === null) return true;
  return now.getTime() - computedAt.getTime() > staleHours * 3600 * 1000;
}

/** Avisa con 30 días de antelación: suficiente para renovar sin prisas. */
export const EXPIRING_SOON_DAYS = 30;

export function isExpiringSoon(endDate: string | null, today: string): boolean {
  if (endDate === null || endDate < today) return false;
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + EXPIRING_SOON_DAYS);
  return endDate <= limit.toISOString().slice(0, 10);
}
