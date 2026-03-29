// Holded API v1 client
// Docs: https://developers.holded.com/

const HOLDED_BASE_URL = "https://api.holded.com/api/invoicing/v1";

export interface HoldedContact {
  id: string;
  name: string;
}

export interface HoldedInvoiceProduct {
  name: string;
  desc?: string;
  units: number;
  price: number;
  subtotal: number;
  tax: number;
  total: number;
  sku?: string;
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
}

export interface HoldedListResponse {
  data: HoldedInvoice[];
}

export class HoldedClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${HOLDED_BASE_URL}${path}`);
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
    limit?: number;
    starttmp?: number;
    endtmp?: number;
  }): Promise<HoldedInvoice[]> {
    const stringParams: Record<string, string> = {};
    if (params?.page) stringParams.page = params.page.toString();
    if (params?.limit) stringParams.limit = params.limit.toString();
    if (params?.starttmp) stringParams.starttmp = params.starttmp.toString();
    if (params?.endtmp) stringParams.endtmp = params.endtmp.toString();

    const res = await this.fetch<HoldedInvoice[]>("/documents/bill", stringParams);
    return res;
  }

  async getAllInvoicesPaginated(type: "invoice" | "bill"): Promise<HoldedInvoice[]> {
    const all: HoldedInvoice[] = [];
    let page = 1;

    while (true) {
      const batch = await this.fetch<HoldedInvoice[]>(
        `/documents/${type}`,
        { page: page.toString() }
      );

      if (!batch || batch.length === 0) break;
      all.push(...batch);
      page++;
    }

    return all;
  }
}
