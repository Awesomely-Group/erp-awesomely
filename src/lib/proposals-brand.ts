// Shared brand → platform/marca/secret mapping for the proposals integration
// (gigsonapps.com / latroupeapps.com → erp-awesomely). See docs/proposals-plan-v2.md.
import type { BudgetTemplate } from "@prisma/client";

export type ProposalBrand = "SOLUTIONS" | "TROUPE";

export const BRAND_VALUES: ProposalBrand[] = ["SOLUTIONS", "TROUPE"];

export function isProposalBrand(value: unknown): value is ProposalBrand {
  return value === "SOLUTIONS" || value === "TROUPE";
}

/** `Budget.template` already models this exact split — reused as-is. */
export function brandToTemplate(brand: ProposalBrand): BudgetTemplate {
  return brand;
}

/** Value stored in `Proforma.marca` (see `MARCA_OPTIONS` in src/lib/org.ts). */
export const BRAND_TO_MARCA: Record<ProposalBrand, string> = {
  SOLUTIONS: "Gigson Solutions",
  TROUPE: "LaTroupe",
};

/** Value stored in `Budget.sourcePlatform`. */
export const BRAND_TO_SOURCE_PLATFORM: Record<ProposalBrand, string> = {
  SOLUTIONS: "GIGSONAPPS",
  TROUPE: "LT_TOOLS",
};

/** Per-platform webhook secret — never the global ERP_API_KEY/CRON_SECRET. */
export function expectedSecretFor(brand: ProposalBrand): string | undefined {
  return brand === "SOLUTIONS"
    ? process.env.GIGSONAPPS_PROPOSALS_SECRET
    : process.env.LTTOOLS_PROPOSALS_SECRET;
}

export function authenticateProposalWebhook(req: Request, brand: unknown): brand is ProposalBrand {
  if (!isProposalBrand(brand)) return false;
  const provided = req.headers.get("x-webhook-secret");
  const expected = expectedSecretFor(brand);
  return !!provided && !!expected && provided === expected;
}
