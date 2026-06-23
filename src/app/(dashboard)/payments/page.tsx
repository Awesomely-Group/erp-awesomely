import { prisma } from "@/lib/prisma";
import { HoldedClient } from "@/lib/holded";
import { PaymentsView } from "./payments-view";
import { type PaymentInvoice } from "./payment-row";
import { type PendingInvoice } from "./payments-view";

// holdedContactId is not populated on invoices (Holded list endpoint omits it),
// so we match partners by normalized counterparty name + companyId instead.
const nameKey = (companyId: string, name: string): string =>
  `${companyId}:${name.toLowerCase().trim()}`;

export default async function PaymentsPage(): Promise<React.JSX.Element> {
  const [invoices, partnerSuppliers] = await Promise.all([
    prisma.invoice.findMany({
      where: { type: { in: ["PURCHASE", "SALE"] }, removedFromHoldedAt: null },
      omit: { status: true },
      include: {
        company: true,
        erpPayments: true,
        verifications: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, periodMismatch: true },
        },
      },
      orderBy: { dueDate: "asc" },
    }),
    prisma.supplier.findMany({
      where: { isPartner: true },
      select: { holdedContactId: true, companyId: true, name: true },
    }),
  ]);

  const partnerNameSet = new Set(
    partnerSuppliers.map((s) => nameKey(s.companyId ?? "", s.name)),
  );
  // Map name key → supplier's holdedContactId (for IBAN lookup)
  const supplierContactIdByName = new Map<string, string>(
    partnerSuppliers
      .filter((s) => s.holdedContactId)
      .map((s) => [nameKey(s.companyId ?? "", s.name), s.holdedContactId]),
  );

  // Collect unique (companyId → Set<holdedContactId>) for partner PURCHASE invoices
  const contactsByCompany = new Map<string, { apiKey: string; contactIds: Set<string> }>();
  for (const inv of invoices) {
    if (inv.type !== "PURCHASE" || !inv.counterparty) continue;
    const nk = nameKey(inv.companyId, inv.counterparty);
    if (!partnerNameSet.has(nk)) continue;
    const contactId = supplierContactIdByName.get(nk);
    if (!contactId) continue;

    const existing = contactsByCompany.get(inv.companyId);
    if (existing) {
      existing.contactIds.add(contactId);
    } else {
      contactsByCompany.set(inv.companyId, {
        apiKey: inv.company.holdedApiKey,
        contactIds: new Set([contactId]),
      });
    }
  }

  // Batch-fetch IBAN for each unique contact (parallel per company)
  const ibanMap = new Map<string, string | null>();
  try {
    await Promise.all(
      [...contactsByCompany.values()].map(async ({ apiKey, contactIds }) => {
        const client = new HoldedClient(apiKey);
        try {
          await Promise.all(
            [...contactIds].map(async (contactId) => {
              try {
                const { iban } = await client.getContactWithBankData(contactId);
                ibanMap.set(contactId, iban);
              } catch {
                ibanMap.set(contactId, null);
              }
            }),
          );
        } catch {
          for (const id of contactIds) ibanMap.set(id, null);
        }
      }),
    );
  } catch {
    // Holded unavailable — page renders without IBAN data
  }

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

    if (holdedPending <= 0.005) continue;

    companyNames.add(inv.company.name);

    if (inv.type === "PURCHASE") {
      const nk = inv.counterparty ? nameKey(inv.companyId, inv.counterparty) : null;
      if (!nk || !partnerNameSet.has(nk)) continue;

      const supplierContactId = supplierContactIdByName.get(nk);

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
        verificationStatus: inv.verifications[0]?.status ?? null,
        erpPayments: inv.erpPayments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          paidAt: p.paidAt.toISOString(),
          paidBy: p.paidBy,
          notes: p.notes,
        })),
        contactIban: supplierContactId ? (ibanMap.get(supplierContactId) ?? null) : null,
        contactHoldedUrl: supplierContactId
          ? `https://app.holded.com/contacts/${supplierContactId}`
          : null,
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
