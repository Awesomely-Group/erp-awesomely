import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate } from "@/lib/utils";

type ProformaRow = {
  number: string | null;
  counterparty: string | null;
  date: Date;
  totalEur: { toNumber(): number };
  company: { name: string };
};

function proformaLine(p: ProformaRow): string {
  const num = p.number ?? "–";
  const client = p.counterparty ?? "–";
  const date = formatDate(p.date);
  const amount = formatCurrency(p.totalEur.toNumber());
  return `• <b>${num}</b>  ${client}  ${date}  <b>${amount}</b>`;
}

function buildCard(
  overdue: ProformaRow[],
  upcoming: ProformaRow[],
  totalEur: number,
  appUrl: string,
): object {
  const sections: object[] = [];

  if (overdue.length > 0) {
    sections.push({
      header: `⚠️ Pendientes anteriores (${overdue.length})`,
      widgets: overdue.map(p => ({ textParagraph: { text: proformaLine(p) } })),
    });
  }

  if (upcoming.length > 0) {
    sections.push({
      header: `📅 Próximas 3 días (${upcoming.length})`,
      widgets: upcoming.map(p => ({ textParagraph: { text: proformaLine(p) } })),
    });
  }

  const count = overdue.length + upcoming.length;
  sections.push({
    widgets: [
      {
        textParagraph: {
          text: `<b>Total pendiente: ${formatCurrency(totalEur)}</b> (${count} proforma${count !== 1 ? "s" : ""})`,
        },
      },
      {
        buttonList: {
          buttons: [
            {
              text: "Ver en ERP",
              onClick: { openLink: { url: `${appUrl}/proformas?alert=expiring` } },
            },
          ],
        },
      },
    ],
  });

  return {
    cardsV2: [
      {
        cardId: "proforma-reminder",
        card: {
          header: {
            title: "🔔 Proformas pendientes de facturar",
            subtitle: formatDate(new Date()),
          },
          sections,
        },
      },
    ],
  };
}

async function handleNotify(req: Request): Promise<NextResponse> {
  const session = await auth();
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isUser = !!session;

  if (!isCron && !isUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "GOOGLE_CHAT_WEBHOOK_URL not configured" },
      { status: 500 },
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 3);
  cutoff.setHours(23, 59, 59, 999);

  const proformas = await prisma.proforma.findMany({
    where: {
      holdedStatus: { in: [0, 1] },
      date: { lte: cutoff },
    },
    select: {
      number: true,
      counterparty: true,
      date: true,
      totalEur: true,
      company: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });

  if (proformas.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const overdue = proformas.filter(p => p.date < today);
  const upcoming = proformas.filter(p => p.date >= today);
  const totalEur = proformas.reduce((sum, p) => sum + p.totalEur.toNumber(), 0);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");

  const card = buildCard(overdue, upcoming, totalEur, appUrl);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Google Chat webhook failed", detail },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sent: proformas.length });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handleNotify(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return handleNotify(req);
}
