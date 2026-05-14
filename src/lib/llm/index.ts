export interface InvoiceClassificationInput {
  lineName: string;
  lineDescription?: string | null;
  counterparty?: string | null;
}

export interface InvoiceClassificationResult {
  projectId?: string | null;
  marca?: string | null;
}

export interface ServicePeriodInput {
  invoiceDescription: string;
}

export interface ServicePeriodResult {
  serviceStart: string;
  serviceEnd: string;
}

export async function classifyInvoiceLine(
  _input: InvoiceClassificationInput,
): Promise<InvoiceClassificationResult> {
  throw new Error("LLM classifier not implemented");
}

export async function extractServicePeriod(
  _input: ServicePeriodInput,
): Promise<ServicePeriodResult> {
  throw new Error("LLM service period extractor not implemented");
}
