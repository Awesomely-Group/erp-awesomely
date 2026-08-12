import { json, badRequest, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { HoldedClient, type HoldedCreateContactPayload } from "@/lib/holded";
import { authenticateProposalWebhook } from "@/lib/proposals-brand";

/**
 * Buscador de contactos de Holded para el módulo Propuestas de gigsonapps.com/
 * latroupeapps.com — proxya `HoldedClient.getClientContacts` sin exponer credenciales de
 * Holded a las plataformas de marca. Auth: `x-webhook-secret` + `?brand=`, igual que el
 * resto de `/api/webhooks/proposals/*`.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const brand = url.searchParams.get("brand");
  const companyId = url.searchParams.get("companyId");
  const q = url.searchParams.get("q") ?? "";

  if (!authenticateProposalWebhook(req, brand)) return unauthorized();
  if (!companyId) return badRequest("companyId es obligatorio");

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { holdedApiKey: true } });
  if (!company) return badRequest("companyId no corresponde a ninguna empresa");

  const client = new HoldedClient(company.holdedApiKey);
  try {
    const contacts = await client.getClientContacts(q || undefined);
    return json(contacts.slice(0, 50));
  } catch {
    return json([], 200);
  }
}

interface CreateContactPayload {
  brand: string;
  companyId: string;
  name: string;
  vatNumber: string;
  isPerson?: boolean;
  email?: string;
  phone?: string;
  billAddress?: HoldedCreateContactPayload["billAddress"];
}

/**
 * Alta de un contacto nuevo en Holded desde el módulo Propuestas — ver "Búsqueda y alta de
 * clientes" en docs/proposals-plan-v2.md para el esquema de campos confirmado contra la
 * documentación oficial de Holded.
 */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body JSON inválido");
  }

  const payload = body as Partial<CreateContactPayload>;
  if (!authenticateProposalWebhook(req, payload.brand)) return unauthorized();

  if (!payload.companyId) return badRequest("companyId es obligatorio");
  if (!payload.name) return badRequest("name es obligatorio");
  if (!payload.vatNumber) return badRequest("vatNumber (NIF/CIF) es obligatorio");

  const company = await prisma.company.findUnique({ where: { id: payload.companyId }, select: { holdedApiKey: true } });
  if (!company) return badRequest("companyId no corresponde a ninguna empresa");

  const client = new HoldedClient(company.holdedApiKey);
  try {
    const contact = await client.createContact({
      name: payload.name,
      vatNumber: payload.vatNumber,
      isPerson: payload.isPerson,
      email: payload.email,
      phone: payload.phone,
      billAddress: payload.billAddress,
      type: "client",
    });
    return json(contact, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear el contacto en Holded";
    return json({ error: message }, 502);
  }
}
