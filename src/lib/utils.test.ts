import { describe, expect, it } from "vitest";
import { cn, formatCurrency, holdedInvoiceUrl } from "./utils";

describe("cn", () => {
  it("merges tailwind classes without duplication", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("re-export de formato", () => {
  it("sigue sirviendo formatCurrency desde @/lib/utils", () => {
    // Los helpers viven en ./format; utils los re-exporta para no romper los
    // imports existentes. La cobertura real está en format.test.ts.
    expect(formatCurrency(1234.5, "EUR")).toContain("1.234,50");
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
