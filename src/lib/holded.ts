// Holded API v1 client
// Docs: https://developers.holded.com/

const HOLDED_BASE_URL = "https://api.holded.com/api/invoicing/v1";
const HOLDED_ACCOUNTING_BASE_URL = "https://api.holded.com/api/accounting/v1";

export interface HoldedContact {
  id: string;
  name: string;
}

export interface HoldedInvoiceProduct {
  name: string;
  desc?: string;
  units: number;
  price: number;
  subtotal?: number; // not returned by Holded API — calculated in sync
  tax: number;       // tax RATE in percent (e.g. 21), not the amount
  total?: number;    // not returned by Holded API — calculated in sync
  discount?: number; // discount percent
  sku?: string;
  account?: string | { id?: string; num?: string; name?: string }; // cuenta contable
}

export interface HoldedInvoice {
  id: string;
  docNumber: string;
  contactName: string;
  contactId?: string;
  date: number; // Unix timestamp
  dueDate?: number;
  currency: string;
  currencyChange: number; // FX rate to EUR (1 if EUR)
  subtotal: number;
  tax: number;
  total: number;
  products: HoldedInvoiceProduct[];
  type: "income" | "purchase";
  status: number; // 0=draft, 1=pending, 2=paid/accepted, 3=late
  paymentsTotal?: number;
  paymentsPending?: number;
  tags?: string[];
}

export interface HoldedListResponse {
  data: HoldedInvoice[];
}

export interface HoldedAccountingAccount {
  id: string;
  account: string; // numeric code e.g. "62300000"
  name: string;
  group?: string;
  debit?: number;
  credit?: number;
  balance?: number;
}

export interface AccountEntry {
  cuenta: string;
  num: string;
  group?: string;
  debit?: number;
  credit?: number;
  balance?: number;
}

export class HoldedClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchFromBase<T>(baseUrl: string, path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      headers: {
        key: this.apiKey,
        "Content-Type": "application/json",
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      throw new Error(`Holded API error ${res.status}: ${await res.text()}`);
    }

    return res.json() as Promise<T>;
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.fetchFromBase<T>(HOLDED_BASE_URL, path, params);
  }

  async getInvoices(params?: {
    page?: number;
    limit?: number;
    starttmp?: number;
    endtmp?: number;
  }): Promise<HoldedInvoice[]> {
    const stringParams: Record<string, string> = {};
    if (params?.page) stringParams.page = params.page.toString();
    if (params?.limit) stringParams.limit = params.limit.toString();
    if (params?.starttmp) stringParams.starttmp = params.starttmp.toString();
    if (params?.endtmp) stringParams.endtmp = params.endtmp.toString();

    const res = await this.fetch<HoldedInvoice[]>("/documents/invoice", stringParams);
    return res;
  }

  async getPurchaseInvoices(params?: {
    page?: number;
    starttmp?: number;
    endtmp?: number;
  }): Promise<HoldedInvoice[]> {
    const stringParams: Record<string, string> = {};
    if (params?.page) stringParams.page = params.page.toString();
    if (params?.starttmp) stringParams.starttmp = params.starttmp.toString();
    if (params?.endtmp) stringParams.endtmp = params.endtmp.toString();

    const res = await this.fetch<HoldedInvoice[]>("/documents/purchase", stringParams);
    return res;
  }

  /**
   * Fetches the chart of accounts from Holded.
   * Returns a map of account code → account name for fast lookup during sync.
   */
  async getAccountNameMap(): Promise<Map<string, string>> {
    try {
      const accounts = await this.fetchFromBase<HoldedAccountingAccount[]>(
        HOLDED_ACCOUNTING_BASE_URL,
        "/account"
      );
      const map = new Map<string, string>();
      for (const acc of accounts) {
        if (acc.account && acc.name) {
          map.set(acc.account, acc.name);
        }
      }
      return map;
    } catch {
      // Non-fatal: if accounting API fails, sync continues without names
      return new Map();
    }
  }

  /**
   * Fetches the full chart of accounts from Holded and returns it as
   * clean AccountEntry[] (no internal id, name → cuenta, sorted by num,
   * duplicate names disambiguated as "<num> - <name>").
   */
  async getAccounts(): Promise<AccountEntry[]> {
    const raw = await this.fetchFromBase<HoldedAccountingAccount[]>(
      HOLDED_ACCOUNTING_BASE_URL,
      "/account"
    );

    const nameCounts = new Map<string, number>();
    for (const a of raw) {
      if (a.name) nameCounts.set(a.name, (nameCounts.get(a.name) ?? 0) + 1);
    }

    const entries: AccountEntry[] = raw
      .filter((a) => a.account)
      .map((a) => ({
        cuenta: (nameCounts.get(a.name) ?? 0) > 1 ? `${a.account} - ${a.name}` : a.name,
        num: a.account,
        ...(a.group !== undefined && { group: a.group }),
        ...(a.debit !== undefined && { debit: a.debit }),
        ...(a.credit !== undefined && { credit: a.credit }),
        ...(a.balance !== undefined && { balance: a.balance }),
      }));

    entries.sort((a, b) => a.num.localeCompare(b.num));
    return entries;
  }

  /**
   * Fetches ALL invoices of a given type from Holded.
   *
   * IMPORTANT: Holded's ?page= parameter does not work — it always returns
   * the same ~100 most-recent documents regardless of the page number.
   * The only way to retrieve the full history is to iterate over quarterly
   * time windows using starttmp/endtmp and deduplicate by ID.
   *
   * Windows start from HOLDED_SYNC_FROM_YEAR (default 2024) up to today.
   * Each window is one quarter (≤ ~100 invoices in practice).
   */
  async getAllInvoicesPaginated(type: "invoice" | "purchase"): Promise<HoldedInvoice[]> {
    const seenIds = new Set<string>();
    const all: HoldedInvoice[] = [];

    const SYNC_FROM_YEAR = 2024;
    const now = new Date();
    const endYear = now.getFullYear();

    for (let year = SYNC_FROM_YEAR; year <= endYear; year++) {
      for (let quarter = 0; quarter < 4; quarter++) {
        const windowStart = new Date(year, quarter * 3, 1);
        // Stop opening future windows beyond today
        if (windowStart > now) break;

        const windowEnd = new Date(year, (quarter + 1) * 3, 1);
        const starttmp = Math.floor(windowStart.getTime() / 1000);
        const endtmp   = Math.floor(windowEnd.getTime()   / 1000);

        const raw = await this.fetch<HoldedInvoice[] | HoldedListResponse>(
          `/documents/${type}`,
          { starttmp: starttmp.toString(), endtmp: endtmp.toString() }
        );

        const batch: HoldedInvoice[] = Array.isArray(raw)
          ? raw
          : ((raw as HoldedListResponse).data ?? []);

        for (const inv of batch) {
          if (!seenIds.has(inv.id)) {
            seenIds.add(inv.id);
            all.push(inv);
          }
        }
      }
    }

    return all;
  }
}
