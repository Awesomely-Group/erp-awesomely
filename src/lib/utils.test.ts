import { describe, expect, it } from "vitest";
import { cn, formatCurrency, holdedInvoiceUrl } from "./utils";

describe("cn", () => {
  it("merges tailwind classes without duplication", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatCurrency", () => {
  it("formats EUR in es-ES", () => {
    const s = formatCurrency(1234.5, "EUR");
    // Decimal separator is comma; grouping may vary by runtime
    expect(s).toMatch(/34,50/);
    expect(s).toContain("€");
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
