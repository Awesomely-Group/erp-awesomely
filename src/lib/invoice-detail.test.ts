import { describe, expect, it } from "vitest";
import {
  toInvoiceDetail,
  type InvoiceDetail,
  type InvoiceDetailRow,
} from "./invoice-detail";

/**
 * Prisma entrega Decimal y Date; el mapper debe devolver number e ISO string
 * para que el detalle viaje como JSON. En el test se usan los tipos primitivos
 * equivalentes, que es lo que `Number(...)` recibe en runtime.
 */
function row(overrides: Partial<InvoiceDetailRow> = {}): InvoiceDetailRow {
  const base = {
    id: "inv_1",
    holdedId: "h_1",
    type: "PURCHASE",
    number: "F260008",
    counterparty: "Irene Deu Espinar (IreneVirtual)",
    date: new Date("2026-09-01T00:00:00.000Z"),
    dueDate: new Date("2026-09-15T00:00:00.000Z"),
    currency: "EUR",
    fxRateToEur: "1",
    subtotal: "406.88",
    tax: "85.45",
    total: "492.33",
    totalEur: "492.33",
    paymentsTotal: "0",
    paymentsPending: "492.33",
    status: "PENDING",
    marca: null,
    removedFromHoldedAt: null,
    company: { name: "Awesomely OU" },
    lines: [],
  };
  return { ...base, ...overrides } as unknown as InvoiceDetailRow;
}

describe("toInvoiceDetail", () => {
  it("convierte los Decimal en number", () => {
    const detail: InvoiceDetail = toInvoiceDetail(row());
    expect(detail.totalEur).toBe(492.33);
    expect(detail.paymentsPending).toBe(492.33);
    expect(detail.fxRateToEur).toBe(1);
  });

  it("convierte las fechas en ISO string", () => {
    const detail = toInvoiceDetail(row());
    expect(detail.date).toBe("2026-09-01T00:00:00.000Z");
    expect(detail.dueDate).toBe("2026-09-15T00:00:00.000Z");
  });

  it("admite factura sin vencimiento", () => {
    expect(toInvoiceDetail(row({ dueDate: null })).dueDate).toBeNull();
  });

  it("construye el deep-link de Holded según el tipo", () => {
    expect(toInvoiceDetail(row()).holdedUrl).toContain("open:purchase-h_1");
    expect(
      toInvoiceDetail(row({ type: "SALE" })).holdedUrl,
    ).toContain("open:invoice-h_1");
  });

  it("admite factura sin líneas", () => {
    expect(toInvoiceDetail(row()).lines).toEqual([]);
  });

  it("mapea las líneas conservando el orden recibido", () => {
    const detail = toInvoiceDetail(
      row({
        lines: [
          {
            id: "l1",
            name: "Primera",
            description: null,
            quantity: "2",
            unitPrice: "100.5",
            subtotal: "201",
            tax: "42.21",
            total: "243.21",
            totalEur: "243.21",
            accountingAccount: "600",
            accountingAccountName: "Compras",
          },
          {
            id: "l2",
            name: "Segunda",
            description: "con descripción",
            quantity: "1",
            unitPrice: "50",
            subtotal: "50",
            tax: "10.5",
            total: "60.5",
            totalEur: "60.5",
            accountingAccount: null,
            accountingAccountName: null,
          },
        ],
      } as unknown as Partial<InvoiceDetailRow>),
    );

    expect(detail.lines.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(detail.lines[0].quantity).toBe(2);
    expect(detail.lines[0].unitPrice).toBe(100.5);
    expect(detail.lines[1].description).toBe("con descripción");
    expect(detail.lines[1].accountingAccount).toBeNull();
  });
});
