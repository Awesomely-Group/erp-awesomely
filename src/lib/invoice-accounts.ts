/**
 * Labels for invoice lines / aggregates built from persisted Holded chart fields.
 *
 * Holded puede mandar `products[].account` como código numérico (ej. 52300100) o como id interno
 * del plan contable (hex 24 chars). En sync, si el id no aparece en chartofaccounts en ese momento,
 * guardamos el id en accountingAccount y dejamos accountingAccountName vacío; hasta una nueva sync
 * que lo resuelva, la UI no puede mostrar el nombre del plan.
 */

/** Id estilo Mongo/ObjectId que usa Holded para cuentas del plan (sin nombre resuelto). */
const HOLDED_ACCOUNT_OBJECT_ID = /^[a-f0-9]{24}$/i;

/**
 * Texto corto para tooltip cuando solo tenemos id interno sin nombre.
 */
export function accountingAccountTooltip(line: {
  accountingAccount: string | null;
  accountingAccountName: string | null;
}): string | undefined {
  const num = line.accountingAccount?.trim() ?? "";
  const nm = line.accountingAccountName?.trim() ?? "";
  if (!num || nm) return undefined;
  if (HOLDED_ACCOUNT_OBJECT_ID.test(num)) return `Id interno Holded (sin nombre en plan): ${num}`;
  return undefined;
}

/** Tooltip agregado para la tabla cuando alguna línea solo tiene id Holded sin nombre. */
export function formatInvoiceAccountsUnresolvedTooltip(
  lines: { accountingAccount: string | null; accountingAccountName: string | null }[]
): string | undefined {
  const tips = lines.map(accountingAccountTooltip).filter((t): t is string => !!t);
  if (tips.length === 0) return undefined;
  return [...new Set(tips)].join("\n");
}

export function lineAccountingLabel(line: {
  accountingAccount: string | null;
  accountingAccountName: string | null;
}): string {
  const num = line.accountingAccount?.trim() ?? "";
  const nm = line.accountingAccountName?.trim() ?? "";
  if (nm && num && nm !== num) return `${num} · ${nm}`;
  if (nm) return nm;
  if (num) {
    if (!nm && HOLDED_ACCOUNT_OBJECT_ID.test(num)) {
      return `Cuenta sin resolver · …${num.slice(-6)}`;
    }
    return num;
  }
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
