import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "EUR"): string {
  // `es-ES` define minimumGroupingDigits = 2 en CLDR, así que con el
  // `useGrouping: "auto"` por defecto los importes de cuatro cifras salían sin
  // punto de millar ("1234,50 €") y solo se agrupaba a partir de 10.000. Es la
  // franja más frecuente del ERP, de ahí que el separador pareciera aplicarse
  // "solo en algunos importes".
  //
  // `maximumFractionDigits` no cambia la salida de EUR/USD/GBP/CHF (las monedas
  // que usamos, todas de 2 decimales); se fija para que la moneda no dependa de
  // los defaults de cada una.
  //
  // Un importe negativo despreciable se normaliza a 0 para no renderizar el
  // "-0,00 €" fantasma que aparecía en subtotales de P&L y cashflow.
  const normalized = Math.abs(amount) < 0.005 ? 0 : amount;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  }).format(normalized);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
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

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
