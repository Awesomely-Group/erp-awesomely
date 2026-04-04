import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "EUR"): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

// Holded app URLs for invoice deep-links
export function holdedInvoiceUrl(holdedId: string, type: "SALE" | "PURCHASE"): string {
  if (type === "SALE") {
    return `https://app.holded.com/sales/revenue#open:invoice-${holdedId}`;
  }
  return `https://app.holded.com/expenses/list#open:purchase-${holdedId}`;
}

const TAG_TO_BRAND: Record<string, string> = {
  gsolutions:     "Gigson Solutions",
  latroupestudio: "LaTroupe",
  awesomely:      "Awesomely",
  gigson:         "Gigson",
};

/** Maps the first Holded tag to a human-readable brand name. Returns null if no tags. */
export function tagToBrand(tags?: string[]): string | null {
  if (!tags || tags.length === 0) return null;
  return TAG_TO_BRAND[tags[0]] ?? tags[0];
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
