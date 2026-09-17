import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Inspección del contacto de Holded: sirve para descubrir cómo se llaman de
 * verdad los campos bancarios (IBAN, titular, BIC, banco) antes de tiparlos,
 * porque v1 y v2 no devuelven la misma forma y la API no está documentada al
 * detalle.
 *
 * Devuelve solo las claves y las entradas que parecen bancarias, nunca el
 * payload entero: el contacto lleva datos personales que no deben volcarse.
 *
 * Uso: /api/debug-contacts?contactId=<id>&companyId=<id> (ambos opcionales; sin
 * ellos coge la primera empresa activa y una factura de compra con contacto).
 */

const BANK_KEY = /iban|bank|swift|bic|account|payment|holder|titular/i;

function pickBankish(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return depth >= 2 ? `[${value.length} elementos]` : value.slice(0, 3);
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (BANK_KEY.test(key)) {
      out[key] = depth >= 2 ? "…" : pickBankish(inner, depth + 1);
    } else if (inner !== null && typeof inner === "object" && depth < 2) {
      const nested = pickBankish(inner, depth + 1);
      if (nested && typeof nested === "object" && Object.keys(nested).length > 0) {
        out[key] = nested;
      }
    }
  }
  return out;
}

async function probe(
  url: string,
  apiKey: string,
): Promise<{
  url: string;
  status: number | null;
  ok: boolean;
  keys: string[];
  bankish: unknown;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      next: { revalidate: 0 },
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* respuesta no JSON */
    }
    const isObject = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
    return {
      url,
      status: res.status,
      ok: res.ok,
      keys: isObject ? Object.keys(parsed as Record<string, unknown>).sort() : [],
      bankish: isObject ? pickBankish(parsed) : null,
    };
  } catch (err) {
    return {
      url,
      status: null,
      ok: false,
      keys: [],
      bankish: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId");

  const company = companyId
    ? await prisma.company.findUnique({ where: { id: companyId } })
    : await prisma.company.findFirst({ where: { active: true } });
  if (!company) return NextResponse.json({ error: "No active company" }, { status: 404 });

  let contactId = url.searchParams.get("contactId");
  let contactName: string | null = null;
  if (!contactId) {
    const sample = await prisma.invoice.findFirst({
      where: { type: "PURCHASE", companyId: company.id, holdedContactId: { not: null } },
      select: { holdedContactId: true, counterparty: true },
    });
    contactId = sample?.holdedContactId ?? null;
    contactName = sample?.counterparty ?? null;
  }
  if (!contactId) {
    return NextResponse.json({ error: "No contact to inspect" }, { status: 404 });
  }

  // Ambas versiones: la cascada de getContactBankData mezcla campos de las dos.
  const results = await Promise.all([
    probe(`https://api.holded.com/api/invoicing/v1/contacts/${contactId}`, company.holdedApiKey),
    probe(`https://api.holded.com/api/v2/contacts/${contactId}`, company.holdedApiKey),
  ]);

  return NextResponse.json({
    company: company.name,
    apiVersionInUse: process.env.HOLDED_API_VERSION ?? "(sin definir)",
    contact: { id: contactId, name: contactName },
    results,
  });
}
