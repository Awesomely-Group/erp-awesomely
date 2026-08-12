// Lógica de precios del configurador de propuestas — heredada de docs/proposals-plan.md
// (plan original, archivado) y conservada como fuente de verdad server-side del cálculo
// BUILD/DISCOVER, usada sobre todo por el catálogo de servicios de Gigson Solutions.
// LaTroupe puede no usar `rateType` en absoluto (sus líneas quedan sin tarifa inferida).
export const PROPOSAL_RATES = { DISCOVER: 100, BUILD: 70 } as const;

export type ProposalRateType = "DISCOVER" | "BUILD";

const DISCOVER_KEYWORDS = ["discovery", "consultor", "dirección", "direccion", "estrategia", "auditoría", "auditoria"];

/** Infers BUILD vs DISCOVER from a Holded service/product name. Always overridable by the user. */
export function inferRateType(serviceName: string): ProposalRateType {
  const lower = serviceName.toLowerCase();
  return DISCOVER_KEYWORDS.some((k) => lower.includes(k)) ? "DISCOVER" : "BUILD";
}

export interface PricingLine {
  rateType?: ProposalRateType | null;
  estimatedHours?: number | null;
  unitPrice?: number | null;
}

export interface BudgetPricing {
  discoverTotal: number;
  buildTotal: number;
  subtotal: number;
  hasDiscount: boolean;
  discountAmount: number;
  discountExpiry: Date | null;
  totalWithDiscount: number;
}

/**
 * Calculates DISCOVER/BUILD subtotals and the Discovery+Build discount (50% off the
 * DISCOVER portion if accepted within 30 days of `sentAt`, only when both rate types are
 * present in the same proposal).
 */
export function calcBudget(lines: PricingLine[], sentAt?: Date | null): BudgetPricing {
  const lineTotal = (l: PricingLine): number =>
    l.unitPrice != null ? Number(l.unitPrice) : (l.estimatedHours ?? 0) * PROPOSAL_RATES[l.rateType ?? "BUILD"];

  const discoverTotal = lines.filter((l) => l.rateType === "DISCOVER").reduce((acc, l) => acc + lineTotal(l), 0);
  const buildTotal = lines.filter((l) => l.rateType !== "DISCOVER").reduce((acc, l) => acc + lineTotal(l), 0);

  const hasDiscount = discoverTotal > 0 && buildTotal > 0;
  const discountAmount = hasDiscount ? discoverTotal * 0.5 : 0;
  const discountExpiry = sentAt ? new Date(sentAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
  const subtotal = discoverTotal + buildTotal;

  return {
    discoverTotal,
    buildTotal,
    subtotal,
    hasDiscount,
    discountAmount,
    discountExpiry,
    totalWithDiscount: subtotal - discountAmount,
  };
}
