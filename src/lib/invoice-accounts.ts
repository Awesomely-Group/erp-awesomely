/**
 * Labels for invoice lines / aggregates built from persisted Holded chart fields.
 */

export function lineAccountingLabel(line: {
  accountingAccount: string | null;
  accountingAccountName: string | null;
}): string {
  const num = line.accountingAccount?.trim() ?? "";
  const nm = line.accountingAccountName?.trim() ?? "";
  if (nm && num && nm !== num) return `${num} · ${nm}`;
  if (nm) return nm;
  if (num) return num;
  return "";
}

/** Summary for the invoices list when an invoice has one or more lines with accounts. */
export function formatInvoiceAccountsSummary(
  lines: { accountingAccount: string | null; accountingAccountName: string | null }[]
): string {
  const labels = lines.map(lineAccountingLabel).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const l of labels) {
    if (!seen.has(l)) {
      seen.add(l);
      unique.push(l);
    }
  }
  if (unique.length === 0) return "—";
  if (unique.length === 1) return unique[0];
  const preview = unique.slice(0, 2).join("; ");
  return unique.length > 2 ? `${preview}; … (${unique.length})` : preview;
}
