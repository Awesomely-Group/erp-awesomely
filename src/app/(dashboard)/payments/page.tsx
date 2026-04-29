import { prisma } from "@/lib/prisma";
import { PaymentsView } from "./payments-view";
import { type PaymentInvoice } from "./payment-row";
import { type PendingInvoice } from "./payments-view";

export default async function PaymentsPage(): Promise<React.JSX.Element> {
  const invoices = await prisma.invoice.findMany({
    where: { type: { in: ["PURCHASE", "SALE"] } },
    include: {
      company: true,
      erpPayments: true,
    },
    orderBy: { dueDate: "asc" },
  });

  const pendingPayments: PaymentInvoice[] = [];
  const pendingCollections: PendingInvoice[] = [];
  const companyNames = new Set<string>();

  for (const inv of invoices) {
    const erpPaid = inv.erpPayments.reduce((s, p) => s + Number(p.amount), 0);
    const holdedPending = Number(inv.paymentsPending);
    const effectivePending =
      inv.type === "PURCHASE"
        ? Math.max(0, holdedPending - erpPaid)
        : Math.max(0, holdedPending);

    if (effectivePending <= 0.005) continue;

    companyNames.add(inv.company.name);

    if (inv.type === "PURCHASE") {
      pendingPayments.push({
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
      });
    } else {
      pendingCollections.push({
        id: inv.id,
        holdedId: inv.holdedId,
        type: inv.type,
        number: inv.number,
        counterparty: inv.counterparty,
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        totalEur: Number(inv.totalEur),
        effectivePending,
        companyName: inv.company.name,
      });
    }
  }

  const companies = Array.from(companyNames).sort();

  return (
    <PaymentsView
      pendingPayments={pendingPayments}
      pendingCollections={pendingCollections}
      companies={companies}
    />
  );
}
