/**
 * Validates that the Holded v2 API normalization and payment calculations
 * produce no NaN values across all invoices, purchases and proformas.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/validate-holded-v2.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import {
  parseCommaNum,
  normalizeV2Invoice,
  type HoldedInvoiceV2Raw,
} from "../src/lib/holded";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Mirrors the NaN guard in sync.ts upsertInvoice ───────────────────────────

function safePayments(
  paymentsTotal: number | undefined,
  paymentsPending: number | undefined,
  total: number | undefined,
  toForeign: number
): { safePayTotal: number; safePayPending: number; hadNaN: boolean } {
  const rawPayTotal = (paymentsTotal ?? 0) * toForeign;
  const rawPayPending = (paymentsPending ?? (total ?? 0)) * toForeign;
  const hadNaN = !Number.isFinite(rawPayTotal) || !Number.isFinite(rawPayPending);
  return {
    safePayTotal: Number.isFinite(rawPayTotal) ? rawPayTotal : 0,
    safePayPending: Number.isFinite(rawPayPending) ? rawPayPending : (total ?? 0),
    hadNaN,
  };
}

// ─── Holded v2 fetch ──────────────────────────────────────────────────────────

async function fetchHoldedV2(
  apiKey: string,
  path: string
): Promise<HoldedInvoiceV2Raw[]> {
  const base = "https://api.holded.com/api/v2";
  const url = `${base}${path}?limit=5000`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`Holded ${path} → HTTP ${res.status}`);
  }
  const raw = (await res.json()) as { items?: HoldedInvoiceV2Raw[] } | HoldedInvoiceV2Raw[];
  return Array.isArray(raw) ? raw : (raw.items ?? []);
}

// ─── Simulate upsertInvoice payment calculation ───────────────────────────────

function simulatePayments(
  inv: ReturnType<typeof normalizeV2Invoice>
): { safePayTotal: number; safePayPending: number; hadNaN: boolean } {
  const currency = (inv.currency ?? "EUR").toUpperCase();
  const holdedRate =
    inv.currencyChange && inv.currencyChange !== 0 ? inv.currencyChange : null;

  let toForeign: number;
  if (currency === "EUR") {
    toForeign = 1;
  } else if (holdedRate !== null) {
    toForeign = holdedRate;
  } else {
    toForeign = 1; // Frankfurter fallback — unknown rate in test context, assume 1
  }

  return safePayments(inv.paymentsTotal, inv.paymentsPending, inv.total, toForeign);
}

// ─── Validate a batch of raw invoices ─────────────────────────────────────────

interface IssueRow {
  id: string;
  docNumber: string;
  field: string;
  rawValue: unknown;
  normalizedValue: unknown;
}

function validateBatch(
  batch: HoldedInvoiceV2Raw[],
  label: string
): { total: number; issues: IssueRow[] } {
  const issues: IssueRow[] = [];

  for (const raw of batch) {
    let inv: ReturnType<typeof normalizeV2Invoice>;
    try {
      inv = normalizeV2Invoice(raw);
    } catch (err) {
      issues.push({
        id: raw.id,
        docNumber: raw.document_number ?? "",
        field: "normalizeV2Invoice",
        rawValue: String(err),
        normalizedValue: null,
      });
      continue;
    }

    // Check all numeric fields for NaN / Infinity
    const numericChecks: Array<[string, number | undefined]> = [
      ["subtotal", inv.subtotal],
      ["tax", inv.tax],
      ["total", inv.total],
      ["currencyChange", inv.currencyChange],
      ["paymentsTotal", inv.paymentsTotal],
      ["paymentsPending", inv.paymentsPending],
      ["date", inv.date],
    ];

    for (const [field, val] of numericChecks) {
      if (val !== undefined && !Number.isFinite(val)) {
        issues.push({
          id: raw.id,
          docNumber: raw.document_number ?? "",
          field,
          rawValue:
            field === "paymentsTotal"
              ? raw.payments_total
              : field === "paymentsPending"
              ? raw.payments_pending
              : field === "currencyChange"
              ? raw.currency_change
              : field === "subtotal"
              ? raw.subtotal
              : field === "tax"
              ? raw.tax
              : field === "total"
              ? raw.total
              : undefined,
          normalizedValue: val,
        });
      }
    }

    // Simulate the upsertInvoice guard
    const { hadNaN } = simulatePayments(inv);
    if (hadNaN) {
      issues.push({
        id: raw.id,
        docNumber: raw.document_number ?? "",
        field: "payments (pre-guard)",
        rawValue: {
          payments_total: raw.payments_total,
          payments_pending: raw.payments_pending,
        },
        normalizedValue: {
          paymentsTotal: inv.paymentsTotal,
          paymentsPending: inv.paymentsPending,
        },
      });
    }
  }

  const icon = issues.length === 0 ? "✅" : "❌";
  console.log(`${icon} ${label}: ${batch.length} docs, ${issues.length} issues`);
  return { total: batch.length, issues };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const apiVersion = process.env.HOLDED_API_VERSION;
  if (apiVersion !== "v2") {
    console.error("❌ HOLDED_API_VERSION must be 'v2'. Export it before running.");
    process.exit(1);
  }

  const companies = await prisma.company.findMany({ where: { active: true } });
  if (companies.length === 0) {
    console.error("❌ No active companies found in DB.");
    process.exit(1);
  }

  console.log(`\nValidating Holded v2 for ${companies.length} company(ies)...\n`);

  const allIssues: Array<{ company: string; path: string } & IssueRow> = [];

  for (const company of companies) {
    console.log(`\n── ${company.name} ──`);
    const paths: Array<[string, string]> = [
      ["/invoices", "SALE"],
      ["/purchases", "PURCHASE"],
      ["/proformas", "PROFORMA"],
    ];

    for (const [path, label] of paths) {
      try {
        const batch = await fetchHoldedV2(company.holdedApiKey, path);
        const { issues } = validateBatch(batch, label);
        for (const issue of issues) {
          allIssues.push({ company: company.name, path, ...issue });
        }
      } catch (err) {
        console.error(`  ❌ ${label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  await prisma.$disconnect();

  console.log("\n" + "─".repeat(60));

  if (allIssues.length === 0) {
    console.log("✅ All documents pass — zero NaN values, sync should work.");
  } else {
    console.log(`❌ ${allIssues.length} issue(s) found:\n`);
    for (const issue of allIssues.slice(0, 20)) {
      console.log(
        `  [${issue.company}] ${issue.path} ${issue.id} (${issue.docNumber})`
      );
      console.log(`    field: ${issue.field}`);
      console.log(`    raw: ${JSON.stringify(issue.rawValue)}`);
      console.log(`    normalized: ${JSON.stringify(issue.normalizedValue)}`);
    }
    if (allIssues.length > 20) {
      console.log(`  ... and ${allIssues.length - 20} more.`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
