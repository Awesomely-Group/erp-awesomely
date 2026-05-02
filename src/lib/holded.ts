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
  status: number; // -1=cancelled/voided, 0=draft (no docNumber), 1=pending, 2=paid/accepted, 3=late
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

/** Row from GET /accounting/v1/chartofaccounts (preferred over legacy /account). */
interface HoldedChartAccountRow {
  id?: string;
  /** Numeric account code */
  num?: string | number;
  /** Some responses use `account` instead of `num` */
  account?: string | number;
  name?: string;
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

  private normalizeChartList(data: unknown): HoldedChartAccountRow[] {
    if (Array.isArray(data)) return data as HoldedChartAccountRow[];
    if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      for (const key of ["accounts", "items", "data"]) {
        const inner = d[key];
        if (Array.isArray(inner)) return inner as HoldedChartAccountRow[];
      }
    }
    return [];
  }

  private chartRowNum(row: HoldedChartAccountRow): string {
    const n = row.num ?? row.account;
    return n != null ? String(n).trim() : "";
  }

  /**
   * Full chart via chartofaccounts + pagination. Falls back to a single request without page/limit if the API rejects paging.
   */
  private async fetchAllChartOfAccounts(): Promise<HoldedChartAccountRow[]> {
    const PAGE_SIZE = 100;
    const MAX_PAGES = 100;
    const merged: HoldedChartAccountRow[] = [];
    let prevFirstId: string | undefined;

    const fetchNoPagination = async (): Promise<HoldedChartAccountRow[]> => {
      const url = new URL(`${HOLDED_ACCOUNTING_BASE_URL}/chartofaccounts`);
      url.searchParams.set("includeEmpty", "1");
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
      return this.normalizeChartList(await res.json());
    };

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL(`${HOLDED_ACCOUNTING_BASE_URL}/chartofaccounts`);
      url.searchParams.set("includeEmpty", "1");
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(PAGE_SIZE));

      const res = await fetch(url.toString(), {
        headers: {
          key: this.apiKey,
          "Content-Type": "application/json",
        },
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        if (page === 1 && res.status === 400) {
          return fetchNoPagination();
        }
        break;
      }

      const batch = this.normalizeChartList(await res.json());
      if (batch.length === 0) break;

      const firstId = batch[0]?.id != null ? String(batch[0].id) : undefined;
      if (page > 1 && firstId !== undefined && firstId === prevFirstId) break;

      merged.push(...batch);
      prevFirstId = firstId;

      if (batch.length < PAGE_SIZE) break;
    }

    return merged;
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
   * Fetches the chart of accounts and returns two lookup maps:
   * - byNum:  numeric code → name  (e.g. "62300000" → "Servicios subcontrata")
   * - byId:   Holded internal id → { num, name }  (e.g. "6846bc…" → { num, name })
   *
   * Non-fatal: returns empty maps if the accounting API is unavailable.
   */
  async getAccountMaps(): Promise<{
    byNum: Map<string, string>;
    byId: Map<string, { num: string; name: string }>;
  }> {
    try {
      const rows = await this.fetchAllChartOfAccounts();
      const byNum = new Map<string, string>();
      const byId = new Map<string, { num: string; name: string }>();
      for (const acc of rows) {
        const num = this.chartRowNum(acc);
        const name = (acc.name ?? "").trim();
        const id = acc.id != null ? String(acc.id).trim() : "";
        if (!name) continue;
        if (num) byNum.set(num, name);
        if (id && num) byId.set(id, { num, name });
      }
      return { byNum, byId };
    } catch {
      return { byNum: new Map(), byId: new Map() };
    }
  }

  /** @deprecated Use getAccountMaps() */
  async getAccountNameMap(): Promise<Map<string, string>> {
    const { byNum } = await this.getAccountMaps();
    return byNum;
  }

  /**
   * Fetches the full chart of accounts from Holded and returns it as
   * clean AccountEntry[] (no internal id, name → cuenta, sorted by num,
   * duplicate names disambiguated as "<num> - <name>").
   */
  async getAccounts(): Promise<AccountEntry[]> {
    try {
      const raw = await this.fetchAllChartOfAccounts();

      const nameCounts = new Map<string, number>();
      for (const a of raw) {
        const nm = (a.name ?? "").trim();
        if (nm) nameCounts.set(nm, (nameCounts.get(nm) ?? 0) + 1);
      }

      const entries: AccountEntry[] = raw
        .map((a) => {
          const num = this.chartRowNum(a);
          const name = (a.name ?? "").trim();
          if (!num || !name) return null;
          const cuenta = (nameCounts.get(name) ?? 0) > 1 ? `${num} - ${name}` : name;
          return {
            cuenta,
            num,
            ...(a.group !== undefined && typeof a.group === "string" && { group: a.group }),
            ...(typeof a.debit === "number" && { debit: a.debit }),
            ...(typeof a.credit === "number" && { credit: a.credit }),
            ...(typeof a.balance === "number" && { balance: a.balance }),
          };
        })
        .filter((e): e is AccountEntry => e !== null);

      entries.sort((a, b) => a.num.localeCompare(b.num));
      return entries;
    } catch {
      return [];
    }
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
