import { describe, it, expect, beforeAll } from "vitest";
import {
  parseCommaNum,
  v2StatusToNum,
  normalizeV2Invoice,
  type HoldedInvoiceV2Raw,
} from "./holded";

// ─── parseCommaNum ─────────────────────────────────────────────────────────────

describe("parseCommaNum", () => {
  it("parses comma-decimal strings", () => {
    expect(parseCommaNum("3750,00")).toBe(3750);
    expect(parseCommaNum("4537,50")).toBe(4537.5);
    expect(parseCommaNum("0,00")).toBe(0);
    expect(parseCommaNum("1234,56")).toBe(1234.56);
  });

  it("parses dot-decimal strings", () => {
    expect(parseCommaNum("4537.5")).toBe(4537.5);
    expect(parseCommaNum("120.00")).toBe(120);
  });

  it("parses integer strings", () => {
    expect(parseCommaNum("120")).toBe(120);
    expect(parseCommaNum("0")).toBe(0);
  });

  it("returns 0 for null / undefined / empty", () => {
    expect(parseCommaNum(null)).toBe(0);
    expect(parseCommaNum(undefined)).toBe(0);
    expect(parseCommaNum("")).toBe(0);
  });

  it("never returns NaN (uses || 0 fallback)", () => {
    expect(parseCommaNum("NaN")).toBe(0);
    expect(parseCommaNum("abc")).toBe(0);
    expect(parseCommaNum(",")).toBe(0);
  });
});

// ─── v2StatusToNum ─────────────────────────────────────────────────────────────

describe("v2StatusToNum", () => {
  it("maps paid → 2", () => expect(v2StatusToNum("paid")).toBe(2));
  it("maps pending → 1", () => expect(v2StatusToNum("pending")).toBe(1));
  it("maps overdue → 3", () => expect(v2StatusToNum("overdue")).toBe(3));
  it("maps late → 3", () => expect(v2StatusToNum("late")).toBe(3));
  it("maps void → -1", () => expect(v2StatusToNum("void")).toBe(-1));
  it("maps cancelled → -1", () => expect(v2StatusToNum("cancelled")).toBe(-1));
  it("maps unknown → 1", () => expect(v2StatusToNum("whatever")).toBe(1));
  it("maps undefined → 1", () => expect(v2StatusToNum(undefined)).toBe(1));
  it("draft=true always → 0", () => {
    expect(v2StatusToNum("paid", true)).toBe(0);
    expect(v2StatusToNum("pending", true)).toBe(0);
    expect(v2StatusToNum(undefined, true)).toBe(0);
  });
});

// ─── normalizeV2Invoice — fixture helpers ──────────────────────────────────────

function makeRaw(overrides: Partial<HoldedInvoiceV2Raw> = {}): HoldedInvoiceV2Raw {
  return {
    id: "abc123",
    document_number: "F260001",
    contact_name: "ACME SL",
    contact_id: "cid001",
    date: "2026-06-01",
    due_date: "2026-07-01",
    currency: "EUR",
    status: "pending",
    subtotal: "3750,00",
    tax: "787,50",
    total: "4537,50",
    lines: [],
    ...overrides,
  };
}

// ─── normalizeV2Invoice — no NaN guarantee ─────────────────────────────────────

describe("normalizeV2Invoice — NaN-free guarantee", () => {
  const numericFields = (
    inv: ReturnType<typeof normalizeV2Invoice>
  ): Record<string, number | undefined> => ({
    subtotal: inv.subtotal,
    tax: inv.tax,
    total: inv.total,
    currencyChange: inv.currencyChange,
    paymentsTotal: inv.paymentsTotal,
    paymentsPending: inv.paymentsPending,
    date: inv.date,
  });

  function assertNoNaN(raw: HoldedInvoiceV2Raw): void {
    const inv = normalizeV2Invoice(raw);
    const fields = numericFields(inv);
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        expect(Number.isNaN(val), `${key} should not be NaN`).toBe(false);
        expect(Number.isFinite(val), `${key} should be finite`).toBe(true);
      }
    }
  }

  it("pending invoice with comma-decimal strings", () => {
    assertNoNaN(makeRaw({ status: "pending" }));
  });

  it("paid invoice with comma-decimal strings", () => {
    assertNoNaN(makeRaw({ status: "paid" }));
  });

  it("overdue invoice", () => {
    assertNoNaN(makeRaw({ status: "overdue" }));
  });

  it("draft invoice", () => {
    assertNoNaN(makeRaw({ draft: true, status: "pending" }));
  });

  it("all numeric fields missing (null/undefined)", () => {
    assertNoNaN(
      makeRaw({
        subtotal: undefined,
        tax: undefined,
        total: undefined,
        payments_total: undefined,
        payments_pending: undefined,
        currency_change: undefined,
      })
    );
  });

  it("payments_total / payments_pending as comma-decimal strings", () => {
    assertNoNaN(
      makeRaw({
        status: "paid",
        payments_total: "4537,50",
        payments_pending: "0,00",
      })
    );
  });

  it("payments_total / payments_pending as plain numbers", () => {
    assertNoNaN(
      makeRaw({
        status: "paid",
        payments_total: 4537.5,
        payments_pending: 0,
      })
    );
  });

  it("payments_total / payments_pending as zero number", () => {
    assertNoNaN(
      makeRaw({
        status: "pending",
        payments_total: 0,
        payments_pending: 0,
      })
    );
  });

  it("payments_total / payments_pending as zero comma-string", () => {
    assertNoNaN(
      makeRaw({
        status: "pending",
        payments_total: "0,00",
        payments_pending: "4537,50",
      })
    );
  });

  it("currency_change as comma-decimal string", () => {
    assertNoNaN(
      makeRaw({
        currency: "PHP",
        currency_change: "67,89",
        status: "pending",
      })
    );
  });

  it("currency_change as number", () => {
    assertNoNaN(
      makeRaw({
        currency: "USD",
        currency_change: 1.12,
        status: "pending",
      })
    );
  });
});

// ─── normalizeV2Invoice — correct values ───────────────────────────────────────

describe("normalizeV2Invoice — correct values", () => {
  it("pending: paymentsTotal=0, paymentsPending=total when fields absent", () => {
    const inv = normalizeV2Invoice(
      makeRaw({
        status: "pending",
        total: "4537,50",
        payments_total: undefined,
        payments_pending: undefined,
      })
    );
    expect(inv.paymentsTotal).toBe(0);
    expect(inv.paymentsPending).toBe(4537.5);
  });

  it("paid: paymentsTotal=total, paymentsPending=0 when fields absent", () => {
    const inv = normalizeV2Invoice(
      makeRaw({
        status: "paid",
        total: "4537,50",
        payments_total: undefined,
        payments_pending: undefined,
      })
    );
    expect(inv.paymentsTotal).toBe(4537.5);
    expect(inv.paymentsPending).toBe(0);
  });

  it("respects explicit payments_total as string", () => {
    const inv = normalizeV2Invoice(
      makeRaw({
        status: "paid",
        total: "4537,50",
        payments_total: "4537,50",
        payments_pending: "0,00",
      })
    );
    expect(inv.paymentsTotal).toBe(4537.5);
    expect(inv.paymentsPending).toBe(0);
  });

  it("respects explicit payments_total as number", () => {
    const inv = normalizeV2Invoice(
      makeRaw({
        status: "paid",
        total: "4537,50",
        payments_total: 4537.5,
        payments_pending: 0,
      })
    );
    expect(inv.paymentsTotal).toBe(4537.5);
    expect(inv.paymentsPending).toBe(0);
  });

  it("payments_total=0 (number) is respected, not replaced by fallback", () => {
    const inv = normalizeV2Invoice(
      makeRaw({
        status: "paid",
        total: "4537,50",
        payments_total: 0,
        payments_pending: 0,
      })
    );
    // payments_total=0 as number → parseCommaNum(String(0)) = parseCommaNum("0") = 0
    expect(inv.paymentsTotal).toBe(0);
    expect(inv.paymentsPending).toBe(0);
  });

  it("parses basic amounts correctly", () => {
    const inv = normalizeV2Invoice(makeRaw());
    expect(inv.subtotal).toBe(3750);
    expect(inv.tax).toBe(787.5);
    expect(inv.total).toBe(4537.5);
    expect(inv.currency).toBe("EUR");
    expect(inv.status).toBe(1); // pending
  });

  it("maps status=paid to 2", () => {
    const inv = normalizeV2Invoice(makeRaw({ status: "paid" }));
    expect(inv.status).toBe(2);
  });

  it("draft invoice gets status 0", () => {
    const inv = normalizeV2Invoice(makeRaw({ draft: true }));
    expect(inv.status).toBe(0);
  });

  it("maps docNumber from document_number", () => {
    const inv = normalizeV2Invoice(makeRaw({ document_number: "F260033" }));
    expect(inv.docNumber).toBe("F260033");
  });

  it("docNumber defaults to empty string when null", () => {
    const inv = normalizeV2Invoice(makeRaw({ document_number: null }));
    expect(inv.docNumber).toBe("");
  });

  it("date is parsed correctly from ISO string", () => {
    const inv = normalizeV2Invoice(makeRaw({ date: "2026-06-01" }));
    expect(inv.date).toBe(Math.floor(new Date("2026-06-01").getTime() / 1000));
  });

  it("products are mapped from lines", () => {
    const inv = normalizeV2Invoice(
      makeRaw({
        lines: [
          {
            name: "Consulting",
            price: "3750,00",
            units: "1,00",
            discount: "0,00",
            description: "Monthly retainer",
            account: "acc123",
          },
        ],
      })
    );
    expect(inv.products).toHaveLength(1);
    expect(inv.products![0].price).toBe(3750);
    expect(inv.products![0].units).toBe(1);
    expect(inv.products![0].discount).toBe(0);
  });

  it("from field is mapped correctly", () => {
    const inv = normalizeV2Invoice(
      makeRaw({ from: { id: "orig123", doc_type: "estimate" } })
    );
    expect(inv.from?.id).toBe("orig123");
    expect(inv.from?.docType).toBe("estimate");
  });
});

// ─── NaN guard logic (mirrors sync.ts safePayTotal / safePayPending) ──────────

describe("NaN guard logic (mirrors upsertInvoice)", () => {
  function applyGuard(
    paymentsTotal: number | undefined,
    paymentsPending: number | undefined,
    total: number | undefined,
    toForeign: number
  ): { safePayTotal: number; safePayPending: number } {
    const rawPayTotal = (paymentsTotal ?? 0) * toForeign;
    const rawPayPending = (paymentsPending ?? (total ?? 0)) * toForeign;
    const safePayTotal = Number.isFinite(rawPayTotal) ? rawPayTotal : 0;
    const safePayPending = Number.isFinite(rawPayPending) ? rawPayPending : (total ?? 0);
    return { safePayTotal, safePayPending };
  }

  it("normal EUR values pass through unchanged", () => {
    const { safePayTotal, safePayPending } = applyGuard(0, 4537.5, 4537.5, 1);
    expect(safePayTotal).toBe(0);
    expect(safePayPending).toBe(4537.5);
  });

  it("paid EUR invoice: full amount paid", () => {
    const { safePayTotal, safePayPending } = applyGuard(4537.5, 0, 4537.5, 1);
    expect(safePayTotal).toBe(4537.5);
    expect(safePayPending).toBe(0);
  });

  it("NaN paymentsTotal is replaced with 0", () => {
    const { safePayTotal } = applyGuard(NaN, 0, 4537.5, 1);
    expect(safePayTotal).toBe(0);
    expect(Number.isNaN(safePayTotal)).toBe(false);
  });

  it("NaN paymentsPending is replaced with total", () => {
    const { safePayPending } = applyGuard(0, NaN, 4537.5, 1);
    expect(safePayPending).toBe(4537.5);
    expect(Number.isNaN(safePayPending)).toBe(false);
  });

  it("undefined payments use correct defaults", () => {
    // pending invoice: paymentsTotal=undefined → 0, paymentsPending=undefined → total
    const { safePayTotal, safePayPending } = applyGuard(undefined, undefined, 4537.5, 1);
    expect(safePayTotal).toBe(0);
    expect(safePayPending).toBe(4537.5);
  });

  it("foreign currency with toForeign multiplier", () => {
    const { safePayTotal, safePayPending } = applyGuard(3750, 0, 3750, 67.89);
    expect(safePayTotal).toBeCloseTo(254587.5);
    expect(safePayPending).toBe(0);
  });

  it("Infinity toForeign is also caught by guard (falls back to 0)", () => {
    const { safePayTotal } = applyGuard(100, 0, 100, Infinity);
    // 100 * Infinity = Infinity; Number.isFinite(Infinity) = false → guard replaces with 0
    expect(safePayTotal).toBe(0);
    expect(Number.isFinite(safePayTotal)).toBe(true);
  });
});

// ─── Real-world invoice samples from Holded v2 ────────────────────────────────

describe("normalizeV2Invoice — real API samples", () => {
  it("NOTION LABS INC — PURCHASE EUR 120, pending, no payment fields", () => {
    const raw: HoldedInvoiceV2Raw = {
      id: "68c07bf68e6057a4e90b0dd3",
      document_number: null,
      contact_name: "NOTION LABS INC",
      contact_id: "68c07bf130fb7bee800b9a57",
      date: "2026-06-30",
      due_date: "2026-06-30",
      currency: "EUR",
      status: "pending",
      subtotal: "120,00",
      tax: "0,00",
      total: "120,00",
      lines: [{ name: "Notion", price: "120,00", units: "1,00" }],
    };
    const inv = normalizeV2Invoice(raw);
    expect(inv.paymentsTotal).toBe(0);
    expect(inv.paymentsPending).toBe(120);
    expect(Number.isNaN(inv.paymentsTotal)).toBe(false);
    expect(Number.isNaN(inv.paymentsPending)).toBe(false);
    expect(inv.total).toBe(120);
    expect(inv.status).toBe(1);
  });

  it("MODA RE — SALE EUR 4537.5, pending, no payment fields", () => {
    const raw: HoldedInvoiceV2Raw = {
      id: "6a18080cf64b42ec43013d75",
      document_number: "F260033",
      contact_name: "MODA RE S COOOP DE INICIATIVA SOCIAL",
      contact_id: "68b89460c77cebb2cb0fb799",
      date: "2026-06-01",
      due_date: "2026-07-01",
      currency: "EUR",
      status: "pending",
      subtotal: "3750,00",
      tax: "787,50",
      total: "4537,50",
      lines: [{ name: "Consulting", price: "3750,00", units: "1,00" }],
    };
    const inv = normalizeV2Invoice(raw);
    expect(inv.paymentsTotal).toBe(0);
    expect(inv.paymentsPending).toBe(4537.5);
    expect(Number.isNaN(inv.paymentsTotal)).toBe(false);
    expect(Number.isNaN(inv.paymentsPending)).toBe(false);
    expect(inv.subtotal).toBe(3750);
    expect(inv.tax).toBe(787.5);
    expect(inv.total).toBe(4537.5);
  });

  it("paid invoice with explicit payment strings from API", () => {
    const raw: HoldedInvoiceV2Raw = {
      id: "paid001",
      document_number: "F260010",
      contact_name: "CLIENT SL",
      contact_id: "cid10",
      date: "2026-05-01",
      due_date: "2026-06-01",
      currency: "EUR",
      status: "paid",
      subtotal: "10000,00",
      tax: "2100,00",
      total: "12100,00",
      payments_total: "12100,00",
      payments_pending: "0,00",
      lines: [],
    };
    const inv = normalizeV2Invoice(raw);
    expect(inv.paymentsTotal).toBe(12100);
    expect(inv.paymentsPending).toBe(0);
    expect(inv.status).toBe(2);
    expect(Number.isNaN(inv.paymentsTotal)).toBe(false);
    expect(Number.isNaN(inv.paymentsPending)).toBe(false);
  });
});
