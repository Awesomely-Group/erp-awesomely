// Holded API client — supports v1 and v2 via HOLDED_API_VERSION env var
// Docs: https://www.holded.com/es/desarrolladores

const IS_V2 = process.env.HOLDED_API_VERSION === "v2";

const HOLDED_BASE_URL = IS_V2
  ? "https://api.holded.com/api/v2"
  : "https://api.holded.com/api/invoicing/v1";

const HOLDED_ACCOUNTING_BASE_URL = IS_V2
  ? "https://api.holded.com/api/v2"
  : "https://api.holded.com/api/accounting/v1";

const HOLDED_SYNC_FROM_YEAR = process.env.HOLDED_SYNC_FROM_YEAR
  ? parseInt(process.env.HOLDED_SYNC_FROM_YEAR, 10)
  : 2020;

export interface HoldedContact {
  id: string;
  name: string;
}

export interface HoldedSupplierContact {
  id: string;
  name: string;
  paymentMethod?: string;
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
  from?: { id: string; docType: string };
}

export interface HoldedListResponse {
  data?: HoldedInvoice[];
  items?: HoldedInvoiceV2Raw[];
}

// ─── Holded API v2 raw types ───────────────────────────────────────────────────

interface HoldedInvoiceLineV2Raw {
  line_id?: string | null;
  name: string;
  type?: string;
  description?: string;
  price?: string;     // "3750,00"
  units?: string;     // "1,00"
  discount?: string;
  tax?: string;
  account?: string;
}

export interface HoldedInvoiceV2Raw {
  id: string;
  document_number?: string | null;
  contact_id?: string;
  contact_name?: string;
  date: string;       // "2026-06-01"
  due_date?: string;
  subtotal?: string;
  total?: string;
  tax?: string;
  currency?: string;
  status?: string;    // "pending" | "paid" | "draft" | "overdue" | "void"
  draft?: boolean;
  tags?: string[];
  lines?: HoldedInvoiceLineV2Raw[];
  currency_change?: number | string;
  payments_total?: number | string;
  payments_pending?: number | string;
  from?: { id: string; doc_type?: string; docType?: string };
}

export function parseCommaNum(s: string | undefined | null): number {
  if (!s) return 0;
  return parseFloat(s.replace(",", ".")) || 0;
}

export function v2StatusToNum(status: string | undefined, draft?: boolean): number {
  if (draft) return 0;
  switch (status) {
    case "paid":      return 2;
    case "overdue":
    case "late":      return 3;
    case "void":
    case "cancelled": return -1;
    default:          return 1; // "pending" and unknown
  }
}

export function normalizeV2Invoice(raw: HoldedInvoiceV2Raw): HoldedInvoice {
  const parseIsoToUnix = (s?: string): number | undefined =>
    s ? Math.floor(new Date(s).getTime() / 1000) : undefined;

  const statusNum = v2StatusToNum(raw.status, raw.draft);
  const total = parseCommaNum(raw.total);
  const isPaid = statusNum === 2;

  return {
    id: raw.id,
    docNumber: raw.document_number ?? "",
    contactName: raw.contact_name ?? "",
    contactId: raw.contact_id,
    date: Math.floor(new Date(raw.date).getTime() / 1000),
    dueDate: parseIsoToUnix(raw.due_date),
    currency: raw.currency ?? "EUR",
    currencyChange: raw.currency_change != null ? parseCommaNum(String(raw.currency_change)) : 0,
    subtotal: parseCommaNum(raw.subtotal),
    tax: parseCommaNum(raw.tax),
    total,
    products: (raw.lines ?? []).map((l) => ({
      name: l.name,
      desc: l.description,
      units: parseCommaNum(l.units) || 1,
      price: parseCommaNum(l.price),
      tax: 0,
      discount: parseCommaNum(l.discount),
      account: l.account,
    })),
    type: "income",
    status: statusNum,
    paymentsTotal: raw.payments_total != null ? parseCommaNum(String(raw.payments_total)) : (isPaid ? total : 0),
    paymentsPending: raw.payments_pending != null ? parseCommaNum(String(raw.payments_pending)) : (isPaid ? 0 : total),
    tags: raw.tags,
    from: raw.from
      ? { id: raw.from.id, docType: raw.from.doc_type ?? raw.from.docType ?? "" }
      : undefined,
  };
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

/** Row from chart of accounts endpoint. */
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

export interface HoldedCreateDocumentPayload {
  date: number;
  contactId?: string;
  contactName?: string;
  currency?: string;
  notes?: string;
  products: Array<{
    name: string;
    units: number;
    price: number;
    subtotal?: number;
    tax?: number;
    discount?: number;
  }>;
}

/** Transforms a v1-style payload to snake_case for the Holded v2 API. */
function toV2DocumentPayload(payload: HoldedCreateDocumentPayload): Record<string, unknown> {
  const isoDate = new Date(payload.date * 1000).toISOString().split("T")[0];

  const base: Record<string, unknown> = {
    date: isoDate,
    currency: payload.currency,
    notes: payload.notes,
    lines: payload.products.map((p) => ({
      name: p.name,
      units: p.units,
      price: p.price,
      ...(p.tax !== undefined ? { tax: p.tax } : {}),
      ...(p.discount !== undefined ? { discount: p.discount } : {}),
    })),
  };

  if (payload.contactId) {
    base.contact_id = payload.contactId;
  } else if (payload.contactName) {
    base.contact_name = payload.contactName;
  }

  return base;
}

export class HoldedClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private authHeaders(): Record<string, string> {
    return IS_V2
      ? { Authorization: `Bearer ${this.apiKey}` }
      : { key: this.apiKey };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${HOLDED_BASE_URL}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Holded API error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const url = `${HOLDED_BASE_URL}${path}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...this.authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Holded API error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  private v2DocPath(docType: string): string {
    const map: Record<string, string> = { estimate: "estimates", proform: "proformas" };
    return map[docType] ?? `${docType}s`;
  }

  async createDocument(
    docType: string,
    payload: HoldedCreateDocumentPayload
  ): Promise<{ id: string; docNumber?: string }> {
    if (IS_V2) {
      return this.post(`/${this.v2DocPath(docType)}`, toV2DocumentPayload(payload));
    }
    return this.post(`/documents/${docType}`, payload);
  }

  async updateDocument(
    docType: string,
    docId: string,
    payload: HoldedCreateDocumentPayload
  ): Promise<{ id: string }> {
    if (IS_V2) {
      return this.put(`/${this.v2DocPath(docType)}/${docId}`, toV2DocumentPayload(payload));
    }
    return this.put(`/documents/${docType}/${docId}`, payload);
  }

  private async fetchFromBase<T>(baseUrl: string, path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      headers: {
        ...this.authHeaders(),
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

  private async fetchAllChartOfAccounts(): Promise<HoldedChartAccountRow[]> {
    const PAGE_SIZE = 100;
    const merged: HoldedChartAccountRow[] = [];

    if (IS_V2) {
      // v2: offset is ignored — fetch all in one shot (chart of accounts always < 1000)
      const raw = await this.fetch<unknown>("/accounting-accounts", {
        limit: "1000",
        includeEmpty: "1",
      });
      return this.normalizeChartList(raw);
    }

    // v1: /chartofaccounts with page-based pagination and prevFirstId workaround
    const MAX_PAGES = 100;
    let prevFirstId: string | undefined;

    const fetchNoPagination = async (): Promise<HoldedChartAccountRow[]> => {
      const url = new URL(`${HOLDED_ACCOUNTING_BASE_URL}/chartofaccounts`);
      url.searchParams.set("includeEmpty", "1");
      const res = await fetch(url.toString(), {
        headers: {
          ...this.authHeaders(),
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
          ...this.authHeaders(),
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

    const path = IS_V2 ? "/invoices" : "/documents/invoice";
    return this.fetch<HoldedInvoice[]>(path, stringParams);
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

    const path = IS_V2 ? "/purchases" : "/documents/purchase";
    return this.fetch<HoldedInvoice[]>(path, stringParams);
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

  async getSupplierContacts(): Promise<HoldedSupplierContact[]> {
    const PAGE_SIZE = 500;
    const all = new Map<string, HoldedSupplierContact>();

    type RawContact = {
      id: string;
      name: string;
      type?: string;
      defaults?: { paymentMethod?: string | number };
    };

    if (IS_V2) {
      // v2: standard offset pagination — /contacts returns { items: [...] }
      let offset = 0;
      while (true) {
        const raw = await this.fetch<RawContact[] | { items?: RawContact[] }>("/contacts", {
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        const batch = Array.isArray(raw) ? raw : (raw.items ?? []);
        if (batch.length === 0) break;
        for (const c of batch) {
          if ((c.type === "supplier" || c.type === "both") && !all.has(c.id)) {
            const pm = c.defaults?.paymentMethod;
            all.set(c.id, { id: c.id, name: c.name, paymentMethod: typeof pm === "string" && pm ? pm : undefined });
          }
        }
        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      return [...all.values()];
    }

    // v1: page-based with prevFirstId workaround (page param unreliable)
    const MAX_PAGES = 20;
    let prevFirstId: string | undefined;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await this.fetch<RawContact[]>(
        "/contacts",
        { page: String(page), limit: String(PAGE_SIZE) }
      );

      if (batch.length === 0) break;

      const firstId = batch[0]?.id;
      if (page > 1 && firstId !== undefined && firstId === prevFirstId) break;
      prevFirstId = firstId;

      for (const c of batch) {
        if ((c.type === "supplier" || c.type === "both") && !all.has(c.id)) {
          const pm = c.defaults?.paymentMethod;
          all.set(c.id, { id: c.id, name: c.name, paymentMethod: typeof pm === "string" && pm ? pm : undefined });
        }
      }

      if (batch.length < PAGE_SIZE) break;
    }

    return [...all.values()];
  }

  async getContactWithBankData(id: string): Promise<{ iban: string | null; paymentMethod: string | null }> {
    const data = await this.fetch<Record<string, unknown>>(`/contacts/${id}`);
    const bankData = data["bankData"] as Record<string, unknown> | undefined;
    const payment = data["payment"] as Record<string, unknown> | undefined;
    const iban =
      (typeof data["iban"] === "string" && data["iban"] ? data["iban"] : null) ??
      (typeof data["bankAccount"] === "string" && data["bankAccount"] ? data["bankAccount"] as string : null) ??
      (typeof bankData?.["iban"] === "string" && bankData["iban"] ? bankData["iban"] as string : null) ??
      (typeof bankData?.["bankAccount"] === "string" && bankData["bankAccount"] ? bankData["bankAccount"] as string : null) ??
      (typeof payment?.["iban"] === "string" && payment["iban"] ? payment["iban"] as string : null) ??
      null;
    const paymentObj = data["payment"] as Record<string, unknown> | undefined;
    const paymentMethod =
      (typeof data["payment_method"] === "string" ? data["payment_method"] : null) ??
      (typeof paymentObj?.["method"] === "string" ? (paymentObj["method"] as string) : null);
    return { iban, paymentMethod };
  }

  async getClientContacts(query?: string): Promise<Array<{ id: string; name: string }>> {
    const PAGE_SIZE = 500;
    const all = new Map<string, string>();

    type RawContact = { id: string; name: string; type?: string };

    if (IS_V2) {
      // v2: standard offset pagination — /contacts returns { items: [...] }
      let offset = 0;
      while (true) {
        const raw = await this.fetch<RawContact[] | { items?: RawContact[] }>("/contacts", {
          limit: String(PAGE_SIZE),
          offset: String(offset),
        });
        const batch = Array.isArray(raw) ? raw : (raw.items ?? []);
        if (batch.length === 0) break;
        for (const c of batch) {
          if ((c.type === "client" || c.type === "both") && !all.has(c.id)) {
            all.set(c.id, c.name);
          }
        }
        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    } else {
      // v1: page-based with prevFirstId workaround
      const MAX_PAGES = 10;
      let prevFirstId: string | undefined;

      for (let page = 1; page <= MAX_PAGES; page++) {
        const batch = await this.fetch<RawContact[]>(
          "/contacts",
          { page: String(page), limit: String(PAGE_SIZE) }
        );

        if (batch.length === 0) break;

        const firstId = batch[0]?.id;
        if (page > 1 && firstId !== undefined && firstId === prevFirstId) break;
        prevFirstId = firstId;

        for (const c of batch) {
          if ((c.type === "client" || c.type === "both") && !all.has(c.id)) {
            all.set(c.id, c.name);
          }
        }

        if (batch.length < PAGE_SIZE) break;
      }
    }

    const results = [...all.entries()].map(([id, name]) => ({ id, name }));
    if (!query) return results;
    const q = query.toLowerCase();
    return results.filter((c) => c.name.toLowerCase().includes(q));
  }

  async getAllProformasPaginated(): Promise<HoldedInvoice[]> {
    if (IS_V2) {
      // v2: offset/page/starttmp are all ignored — single request with large limit
      const raw = await this.fetch<{ items?: HoldedInvoiceV2Raw[] } | HoldedInvoiceV2Raw[]>("/proformas", {
        limit: "5000",
      });
      const rawBatch = Array.isArray(raw) ? raw : (raw.items ?? []);
      return rawBatch.map(normalizeV2Invoice);
    }

    // v1: quarterly time windows workaround (page param does not work reliably)
    const seenIds = new Set<string>();
    const all: HoldedInvoice[] = [];

    const now = new Date();
    const endYear = now.getFullYear();

    for (let year = HOLDED_SYNC_FROM_YEAR; year <= endYear; year++) {
      for (let quarter = 0; quarter < 4; quarter++) {
        const windowStart = new Date(year, quarter * 3, 1);
        if (windowStart > now) break;

        const windowEnd = new Date(year, (quarter + 1) * 3, 1);
        const starttmp = Math.floor(windowStart.getTime() / 1000);
        const endtmp   = Math.floor(windowEnd.getTime()   / 1000);

        const raw = await this.fetch<HoldedInvoice[] | HoldedListResponse>(
          `/documents/proform`,
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

  async getAllInvoicesPaginated(type: "invoice" | "purchase"): Promise<HoldedInvoice[]> {
    if (IS_V2) {
      if (type === "invoice") {
        // /invoices: no hard cap observed — single request is sufficient
        const raw = await this.fetch<{ items?: HoldedInvoiceV2Raw[] } | HoldedInvoiceV2Raw[]>("/invoices", {
          limit: "5000",
        });
        const rawBatch = Array.isArray(raw) ? raw : (raw.items ?? []);
        return rawBatch.map(normalizeV2Invoice);
      }

      // /purchases: Holded v2 hard-caps at 200 per request regardless of `limit`.
      // offset/page are ignored. Use monthly start_date/end_date windows fetched in parallel.
      const now = new Date();
      const endYear = now.getFullYear();

      // Build list of all month windows to fetch
      const windows: Array<{ start: string; end: string }> = [];
      for (let year = HOLDED_SYNC_FROM_YEAR; year <= endYear; year++) {
        const endMonth = year === endYear ? now.getMonth() + 1 : 12;
        for (let month = 1; month <= endMonth; month++) {
          const mm = String(month).padStart(2, "0");
          const lastDay = new Date(year, month, 0).getDate();
          windows.push({ start: `${year}-${mm}-01`, end: `${year}-${mm}-${lastDay}` });
        }
      }

      // Fetch all windows in parallel — 5x-10x faster than sequential
      const batches = await Promise.all(
        windows.map(({ start, end }) =>
          this.fetch<{ items?: HoldedInvoiceV2Raw[] } | HoldedInvoiceV2Raw[]>(
            "/purchases",
            { limit: "500", start_date: start, end_date: end }
          ).then((raw) => (Array.isArray(raw) ? raw : (raw.items ?? [])))
        )
      );

      const seenIds = new Set<string>();
      const all: HoldedInvoice[] = [];
      for (const batch of batches) {
        for (const item of batch) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            all.push(normalizeV2Invoice(item));
          }
        }
      }
      return all;
    }

    // v1: quarterly time windows workaround (page param does not work reliably)
    const seenIds = new Set<string>();
    const all: HoldedInvoice[] = [];

    const now = new Date();
    const endYear = now.getFullYear();

    for (let year = HOLDED_SYNC_FROM_YEAR; year <= endYear; year++) {
      for (let quarter = 0; quarter < 4; quarter++) {
        const windowStart = new Date(year, quarter * 3, 1);
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
