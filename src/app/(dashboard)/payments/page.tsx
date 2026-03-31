import { prisma } from "@/lib/prisma";
import { type PaymentInvoice } from "./payment-row";
import { PaymentsView, type BatchData } from "./payments-view";

// Returns the latest batch date (15th or 30th) that is <= dueDate
// This maximizes delay while keeping payment on time
function getPaymentBatch(dueDate: Date): Date {
  const y = dueDate.getFullYear();
  const m = dueDate.getMonth();
  const d = dueDate.getDate();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const batch30 = Math.min(30, lastDay);

  if (d >= batch30) return new Date(y, m, batch30);
  if (d >= 15) return new Date(y, m, 15);

  // Due before the 15th: use previous month's last batch
  const prevM = m === 0 ? 11 : m - 1;
  const prevY = m === 0 ? y - 1 : y;
  const prevLastDay = new Date(prevY, prevM + 1, 0).getDate();
  return new Date(prevY, prevM, Math.min(30, prevLastDay));
}

function batchKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function batchLabel(d: Date): string {
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

export default async function PaymentsPage(): Promise<React.JSX.Element> {
  const invoices = await prisma.invoice.findMany({
    where: { type: "PURCHASE" },
    include: {
      company: true,
      erpPayments: { orderBy: { paidAt: "asc" } },
    },
    orderBy: { dueDate: "asc" },
  });

  // Build PaymentInvoice rows
  const rows: PaymentInvoice[] = invoices.map((inv) => {
    const erpPaid = inv.erpPayments.reduce((s, p) => s + Number(p.amount), 0);
    const holdedPending = Number(inv.paymentsPending);
    const effectivePending = Math.max(0, holdedPending - erpPaid);

    return {
      id: inv.id,
      holdedId: inv.holdedId,
      number: inv.number,
      counterparty: inv.counterparty,
      dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
      totalEur: Number(inv.totalEur),
      paymentsPending: holdedPending,
      erpPaid,
      effectivePending,
      companyName: inv.company.name,
      erpPayments: inv.erpPayments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        paidAt: p.paidAt.toISOString(),
        paidBy: p.paidBy,
        notes: p.notes,
      })),
    };
  });

  // Group by batch
  const batchMap = new Map<string, { date: Date; rows: PaymentInvoice[] }>();
  const noDueRows: PaymentInvoice[] = [];

  for (const row of rows) {
    if (!row.dueDate) {
      noDueRows.push(row);
      continue;
    }
    const batchDate = getPaymentBatch(new Date(row.dueDate));
    const key = batchKey(batchDate);
    if (!batchMap.has(key)) batchMap.set(key, { date: batchDate, rows: [] });
    batchMap.get(key)!.rows.push(row);
  }

  // Sort batches: most recent first
  const batches: BatchData[] = Array.from(batchMap.values())
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .map((b) => ({
      dateStr: batchKey(b.date),
      label: batchLabel(b.date),
      rows: b.rows,
    }));

  // Unique company names for filter
  const companies = Array.from(new Set(rows.map((r) => r.companyName))).sort();

  const totalPending = rows.reduce((s, r) => s + r.effectivePending, 0);
  const totalPaidRows = rows.filter((r) => r.effectivePending <= 0.005).length;

  return (
    <PaymentsView
      batches={batches}
      noDueRows={noDueRows}
      companies={companies}
      totalRows={rows.length}
      totalPaidRows={totalPaidRows}
      totalPending={totalPending}
    />
  );
}
