// Documenso API client — e-signature + open-tracking for client proposals.
// Docs: https://docs.documenso.com/docs/developers/api/documents
//       https://docs.documenso.com/docs/developers/webhooks/events
//       https://docs.documenso.com/docs/developers/webhooks/verification
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
 * Documenso no firma el cuerpo: envía el secreto configurado tal cual en la cabecera
 * `X-Documenso-Secret`, y el receptor lo compara con el suyo. No hay HMAC.
 * Ver https://docs.documenso.com/docs/developers/webhooks/verification
 *
 * La comparación es en tiempo constante, como pide esa página. Se comparan los digests
 * SHA-256 y no los valores en bruto porque `timingSafeEqual` exige operandos de la misma
 * longitud: pasarle los valores directamente obligaría a comprobar la longitud antes, y
 * esa rama filtraría por sí sola si la longitud del secreto coincide.
 *
 * Un secreto vacío se rechaza: Documenso manda la cabecera vacía cuando el webhook se
 * configuró sin secreto, y eso no puede valer como válido.
 */
export function verifyWebhookSecret(secretHeader: string | null): boolean {
  const expected = process.env.DOCUMENSO_WEBHOOK_SECRET;
  if (!expected || !secretHeader) return false;
  return crypto.timingSafeEqual(
    crypto.createHash("sha256").update(secretHeader).digest(),
    crypto.createHash("sha256").update(expected).digest(),
  );
}
