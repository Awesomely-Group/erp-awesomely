import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/debug-invoice-raw?id=<invoiceId>
// Fetches the raw Holded API response for a specific invoice to compare with what's stored in DB
export async function GET(req: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const invoiceId = searchParams.get("id");
  if (!invoiceId) return NextResponse.json({ error: "Missing id param" }, { status: 400 });

  // Get invoice from DB
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      company: true,
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });

  if (!invoice) return NextResponse.json({ error: "Invoice not found in DB" }, { status: 404 });

  const docType = invoice.type === "SALE" ? "invoice" : "purchase";

  // Fetch raw from Holded
  let holdedRaw: unknown = null;
  let holdedError: string | null = null;
  try {
    const res = await fetch(
      `https://api.holded.com/api/invoicing/v1/documents/${docType}/${invoice.holdedId}`,
      {
        headers: { key: invoice.company.holdedApiKey },
      }
    );
    if (res.ok) {
      holdedRaw = await res.json();
    } else {
      holdedError = `${res.status}: ${await res.text()}`;
    }
  } catch (e) {
    holdedError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    db: {
      id: invoice.id,
      holdedId: invoice.holdedId,
      type: invoice.type,
      number: invoice.number,
      lineCount: invoice.lines.length,
      lines: invoice.lines.map((l) => ({
        name: l.name,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        subtotal: Number(l.subtotal),
        tax: Number(l.tax),
        total: Number(l.total),
      })),
    },
    holdedRaw,
    holdedError,
  });
}
