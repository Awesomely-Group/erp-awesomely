/**
 * Saldo de caja por sociedad, calculado desde los pagos registrados en el ERP.
 *
 * Estaba dentro del tool de MCP; se extrae aquí porque desde `/api/v1` hay dos puertas
 * al mismo dato y una copia del cálculo es una divergencia esperando a ocurrir. El tool
 * pasa a llamar a esta función.
 *
 * `allowedCompanyIds` es la frontera de la credencial, no un filtro de conveniencia:
 * una clave acotada a una sociedad **no puede** sumar la caja de la otra, y por eso se
 * aplica aquí dentro y no en quien llama.
 */
import { prisma } from "@/lib/prisma";

export type CompanyCashBalance = {
  companyId: string;
  companyName: string;
  salesCollected: number;
  purchasesPaid: number;
  netCashPosition: number;
  pendingToCollect: number;
  pendingToPay: number;
  totalSalesInvoiced: number;
  totalPurchasesInvoiced: number;
};

export type ConsolidatedCashBalance = {
  salesCollected: number;
  purchasesPaid: number;
  netCashPosition: number;
  pendingToCollect: number;
  pendingToPay: number;
};

export type CashBalanceResult = {
  companies: CompanyCashBalance[];
  consolidated: ConsolidatedCashBalance;
  note: string;
  generatedAt: string;
};

export async function getCashBalance(options: {
  /** Vacío = todas las que la credencial alcance. */
  allowedCompanyIds: string[];
  /** Acota **dentro** de las permitidas; fuera de ellas no devuelve nada. */
  companyId?: string | null;
}): Promise<CashBalanceResult> {
  const { allowedCompanyIds, companyId } = options;

  const idsPermitidos =
    allowedCompanyIds.length === 0
      ? undefined
      : companyId
        ? allowedCompanyIds.filter((id) => id === companyId)
        : allowedCompanyIds;

  const companies = await prisma.company.findMany({
    where: {
      active: true,
      ...(idsPermitidos ? { id: { in: idsPermitidos } } : companyId ? { id: companyId } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const ids = companies.map((company) => company.id);
  if (ids.length === 0) {
    return {
      companies: [],
      consolidated: {
        salesCollected: 0,
        purchasesPaid: 0,
        netCashPosition: 0,
        pendingToCollect: 0,
        pendingToPay: 0,
      },
      note: NOTA,
      generatedAt: new Date().toISOString(),
    };
  }

  const sumar = (type: "SALE" | "PURCHASE") =>
    prisma.invoice.groupBy({
      by: ["companyId"],
      where: { holdedStatus: { not: -1 }, removedFromHoldedAt: null, type, companyId: { in: ids } },
      _sum: { paymentsTotal: true, paymentsPending: true, totalEur: true },
    });

  const [ventas, compras] = await Promise.all([sumar("SALE"), sumar("PURCHASE")]);

  const porVentas = new Map(ventas.map((fila) => [fila.companyId, fila._sum]));
  const porCompras = new Map(compras.map((fila) => [fila.companyId, fila._sum]));

  const porSociedad: CompanyCashBalance[] = companies.map((company) => {
    const venta = porVentas.get(company.id);
    const compra = porCompras.get(company.id);

    const salesCollected = Number(venta?.paymentsTotal ?? 0);
    const purchasesPaid = Number(compra?.paymentsTotal ?? 0);

    return {
      companyId: company.id,
      companyName: company.name,
      salesCollected,
      purchasesPaid,
      netCashPosition: salesCollected - purchasesPaid,
      pendingToCollect: Number(venta?.paymentsPending ?? 0),
      pendingToPay: Number(compra?.paymentsPending ?? 0),
      totalSalesInvoiced: Number(venta?.totalEur ?? 0),
      totalPurchasesInvoiced: Number(compra?.totalEur ?? 0),
    };
  });

  const consolidated = porSociedad.reduce<ConsolidatedCashBalance>(
    (total, fila) => ({
      salesCollected: total.salesCollected + fila.salesCollected,
      purchasesPaid: total.purchasesPaid + fila.purchasesPaid,
      netCashPosition: total.netCashPosition + fila.netCashPosition,
      pendingToCollect: total.pendingToCollect + fila.pendingToCollect,
      pendingToPay: total.pendingToPay + fila.pendingToPay,
    }),
    { salesCollected: 0, purchasesPaid: 0, netCashPosition: 0, pendingToCollect: 0, pendingToPay: 0 },
  );

  return { companies: porSociedad, consolidated, note: NOTA, generatedAt: new Date().toISOString() };
}

const NOTA =
  "Calculado desde los pagos registrados en el ERP, no desde el extracto bancario: " +
  "no incluye movimientos sin factura (nóminas, impuestos, transferencias entre cuentas).";
