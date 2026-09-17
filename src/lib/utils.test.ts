import { describe, expect, it } from "vitest";
import { cn, formatCurrency, holdedInvoiceUrl } from "./utils";

describe("cn", () => {
  it("merges tailwind classes without duplication", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatCurrency", () => {
  // Intl separa el importe del símbolo con un espacio duro (U+00A0), no con un
  // espacio normal: los asserts exactos deben usarlo.
  const NBSP = "\u00A0";

  it("formats EUR in es-ES", () => {
    expect(formatCurrency(1234.5, "EUR")).toBe(`1.234,50${NBSP}€`);
  });

  it("agrupa los miles también por debajo de 10.000", () => {
    // El defecto `useGrouping: "auto"` no agrupaba en esta franja, que es la
    // más frecuente del ERP.
    expect(formatCurrency(999)).toBe(`999,00${NBSP}€`);
    expect(formatCurrency(1000)).toBe(`1.000,00${NBSP}€`);
    expect(formatCurrency(9999.99)).toBe(`9.999,99${NBSP}€`);
    expect(formatCurrency(10000)).toBe(`10.000,00${NBSP}€`);
    expect(formatCurrency(1234567.89)).toBe(`1.234.567,89${NBSP}€`);
  });

  it("formatea cero y negativos", () => {
    expect(formatCurrency(0)).toBe(`0,00${NBSP}€`);
    expect(formatCurrency(-1234.5)).toBe(`-1.234,50${NBSP}€`);
  });

  it("no renderiza el cero negativo fantasma", () => {
    expect(formatCurrency(-0.001)).toBe(`0,00${NBSP}€`);
    expect(formatCurrency(-0)).toBe(`0,00${NBSP}€`);
  });

  it("respeta otras monedas", () => {
    expect(formatCurrency(1234.5, "USD")).toContain("1.234,50");
    expect(formatCurrency(1234.5, "GBP")).toContain("1.234,50");
  });
});

describe("holdedInvoiceUrl", () => {
  it("builds sale and purchase deep links", () => {
    expect(holdedInvoiceUrl("abc123", "SALE")).toBe(
      "https://app.holded.com/sales/revenue#open:invoice-abc123"
    );
    expect(holdedInvoiceUrl("xyz", "PURCHASE")).toBe(
      "https://app.holded.com/expenses/list#open:purchase-xyz"
    );
  });
});
