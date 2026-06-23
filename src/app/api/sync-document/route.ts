import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { syncDocumentById } from "@/lib/sync";

// POST /api/sync-document
// Imports a single Holded document by its holdedId, bypassing the date-windowed
// list endpoints. Useful for documents that exist in Holded but are not returned
// by the regular paginated sync (e.g. unnumbered purchases, edge-case date issues).
//
// Body: { holdedId: string, type: "invoice" | "purchase", companyId: string }
// Response: { status: "ok" | "not_found", holdedId, invoiceId?: string }
export async function POST(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { holdedId, type, companyId } = body as {
    holdedId?: unknown;
    type?: unknown;
    companyId?: unknown;
  };

  if (typeof holdedId !== "string" || !holdedId) {
    return NextResponse.json({ error: "holdedId is required" }, { status: 400 });
  }
  if (type !== "invoice" && type !== "purchase") {
    return NextResponse.json({ error: 'type must be "invoice" or "purchase"' }, { status: 400 });
  }
  if (typeof companyId !== "string" || !companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  try {
    const result = await syncDocumentById(companyId, holdedId, type);
    if (!result.found) {
      return NextResponse.json({ status: "not_found", holdedId }, { status: 404 });
    }
    return NextResponse.json({ status: "ok", holdedId, invoiceId: result.invoiceId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
