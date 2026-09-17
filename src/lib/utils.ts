import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// El formato numérico y de fechas vive en `./format`; se re-exporta aquí para
// que los módulos que ya importaban desde `@/lib/utils` sigan funcionando.
export {
  EMPTY_VALUE,
  formatCurrency,
  formatCurrencyRounded,
  formatDate,
  formatDateTime,
  formatHourlyRate,
  formatHours,
  formatMaybe,
  formatNumber,
  formatPercent,
  formatThousandsTick,
} from "./format";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Holded app URLs for invoice deep-links
export function holdedInvoiceUrl(
  holdedId: string,
  type: "SALE" | "PURCHASE",
): string {
  if (type === "SALE") {
    return `https://app.holded.com/sales/revenue#open:invoice-${holdedId}`;
  }
  return `https://app.holded.com/expenses/list#open:purchase-${holdedId}`;
}

export function holdedProformaUrl(holdedId: string): string {
  return `https://app.holded.com/sales/proforms#open:proform-${holdedId}`;
}

export function holdedEstimateUrl(holdedId: string): string {
  return `https://app.holded.com/sales/estimates#open:estimate-${holdedId}`;
}

// Deep-link a una nómina en el módulo "Team" de Holded (formato confirmado por el
// usuario: app.holded.com/team/v2/payrolls/salary-record/<id>).
export function holdedPayrollUrl(holdedSalaryRecordId: string): string {
  return `https://app.holded.com/team/v2/payrolls/salary-record/${holdedSalaryRecordId}`;
}

const TAG_TO_BRAND: Record<string, string> = {
  gsolutions: "Gigson Solutions",
  gigson: "Gigson",
  awesomely: "Awesomely",
  latroupestudio: "LaTroupe",
  latroupe: "LaTroupe", // variante sin "studio"
};

/** Maps the first Holded tag to a human-readable brand name. Returns null if unknown or no tags. */
export function tagToBrand(tags?: string[]): string | null {
  if (!tags || tags.length === 0) return null;
  return TAG_TO_BRAND[tags[0]] ?? null;
}
