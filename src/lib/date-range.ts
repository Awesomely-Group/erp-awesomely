/** Rango de fechas para filtros por periodo o fechas personalizadas (facturas, dashboard). */
export function getDateRange(
  period: string,
  dateFrom?: string,
  dateTo?: string
): { gte?: Date; lte?: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3);

  switch (period) {
    case "this_month":
      return { gte: new Date(y, m, 1), lte: new Date(y, m + 1, 0, 23, 59, 59) };
    case "last_month":
      return { gte: new Date(y, m - 1, 1), lte: new Date(y, m, 0, 23, 59, 59) };
    case "this_quarter":
      return { gte: new Date(y, q * 3, 1), lte: new Date(y, q * 3 + 3, 0, 23, 59, 59) };
    case "last_quarter": {
      const lq = q === 0 ? 3 : q - 1;
      const lqy = q === 0 ? y - 1 : y;
      return {
        gte: new Date(lqy, lq * 3, 1),
        lte: new Date(lqy, lq * 3 + 3, 0, 23, 59, 59),
      };
    }
    case "this_year":
      return { gte: new Date(y, 0, 1), lte: new Date(y, 11, 31, 23, 59, 59) };
    case "last_year":
      return { gte: new Date(y - 1, 0, 1), lte: new Date(y - 1, 11, 31, 23, 59, 59) };
    case "custom":
      return {
        gte: dateFrom ? new Date(dateFrom) : undefined,
        lte: dateTo ? new Date(dateTo + "T23:59:59") : undefined,
      };
    default:
      return {};
  }
}
