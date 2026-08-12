// Documenso API client — e-signature + open-tracking for client proposals.
// Docs: https://docs.documenso.com/docs/developers/api/documents
//       https://docs.documenso.com/docs/developers/webhooks/events
//
// NOTE: the exact webhook signature header/algorithm could not be confirmed from the
// public docs during implementation (the verification sub-page wasn't reachable). Before
// relying on `verifyWebhookSignature` in production, confirm the real header name and
// algorithm against the webhook configured in the Documenso team settings, and adjust if
// needed — see docs/proposals-plan-v2.md "Riesgos abiertos".
import crypto from "node:crypto";

const DOCUMENSO_BASE_URL = process.env.DOCUMENSO_BASE_URL ?? "https://app.documenso.com/api/v1";

function apiKey(): string {
  const key = process.env.DOCUMENSO_API_KEY;
  if (!key) throw new Error("DOCUMENSO_API_KEY no está configurada");
  return key;
}

export interface DocumensoRecipient {
  name: string;
  email: string;
}

export interface CreateDocumentResult {
  documentId: number;
  /** Signing URL for the (single) recipient created alongside the document. */
  signingUrl: string;
}

/**
 * Downloads the PDF at `pdfUrl` (exported from Figma/Claude Design, or from the brand
 * platform's own configurator) and creates a Documenso document with a single signer.
 * Does NOT send it yet — call `distributeDocument` to move it from DRAFT to PENDING and
 * trigger the recipient's email.
 */
export async function createDocumentFromPdf(params: {
  pdfUrl: string;
  title: string;
  recipient: DocumensoRecipient;
}): Promise<CreateDocumentResult> {
  const pdfRes = await fetch(params.pdfUrl);
  if (!pdfRes.ok) {
    throw new Error(`No se pudo descargar el PDF de la propuesta (${pdfRes.status}): ${params.pdfUrl}`);
  }
  const pdfBlob = await pdfRes.blob();

  const form = new FormData();
  form.append(
    "data",
    JSON.stringify({
      type: "DOCUMENT",
      title: params.title,
      recipients: [{ email: params.recipient.email, name: params.recipient.name, role: "SIGNER" }],
    })
  );
  form.append("files", pdfBlob, `${params.title}.pdf`);

  const res = await fetch(`${DOCUMENSO_BASE_URL}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Documenso API error ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    id?: number;
    documentId?: number;
    recipients?: Array<{ signingUrl?: string; token?: string }>;
  };

  const documentId = data.id ?? data.documentId;
  if (documentId === undefined) throw new Error("Documenso no devolvió un id de documento");

  const signingUrl =
    data.recipients?.[0]?.signingUrl ??
    (data.recipients?.[0]?.token ? `https://app.documenso.com/sign/${data.recipients[0].token}` : undefined);
  if (!signingUrl) throw new Error("Documenso no devolvió un link de firma para el destinatario");

  return { documentId, signingUrl };
}

/** Moves a document from DRAFT to PENDING, sending the signing email to the recipient. */
export async function distributeDocument(documentId: number): Promise<void> {
  const res = await fetch(`${DOCUMENSO_BASE_URL}/documents/${documentId}/distribute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`Documenso API error ${res.status}: ${await res.text()}`);
  }
}

export async function getDocument(documentId: number): Promise<{
  status: string;
  completedAt?: string;
}> {
  const res = await fetch(`${DOCUMENSO_BASE_URL}/documents/${documentId}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) {
    throw new Error(`Documenso API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ status: string; completedAt?: string }>;
}

// ─── Webhook payload + signature verification ─────────────────────────────────

export type DocumensoWebhookEvent =
  | "DOCUMENT_CREATED"
  | "DOCUMENT_SENT"
  | "DOCUMENT_OPENED"
  | "DOCUMENT_SIGNED"
  | "DOCUMENT_RECIPIENT_COMPLETED"
  | "DOCUMENT_COMPLETED"
  | "DOCUMENT_REJECTED"
  | "DOCUMENT_CANCELLED";

export interface DocumensoWebhookPayload {
  event: DocumensoWebhookEvent;
  payload: {
    id?: number;
    documentId?: number;
    envelopeId?: string;
    status?: string;
    completedAt?: string;
  };
}

/**
 * Best-effort HMAC-SHA256 verification of the Documenso webhook secret.
 * TODO(verify): confirm the exact header name Documenso sends (assumed
 * `x-documenso-signature` below) against the live webhook config before trusting this in
 * production — see the module-level note at the top of this file.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.DOCUMENSO_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
