import { prisma } from "@/lib/prisma";
import { HoldedClient } from "@/lib/holded";
import { PaymentsView } from "./payments-view";
import { type PaymentInvoice } from "./payment-row";
import { type PendingInvoice } from "./payments-view";

const partnerKey = (companyId: string, contactId: string): string =>
  `${companyId}:${contactId}`;

export default async function PaymentsPage(): Promise<React.JSX.Element> {
  const [invoices, partnerSuppliers] = await Promise.all([
    prisma.invoice.findMany({
      where: { type: { in: ["PURCHASE", "SALE"] } },
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
      select: { holdedContactId: true, companyId: true },
    }),
  ]);

  const partnerSet = new Set(
    partnerSuppliers.map((s) => partnerKey(s.companyId ?? "", s.holdedContactId)),
  );

  // Collect unique (companyId → Set<holdedContactId>) for partner PURCHASE invoices only
  const contactsByCompany = new Map<string, { apiKey: string; contactIds: Set<string> }>();
  for (const inv of invoices) {
    if (
      inv.type === "PURCHASE" &&
      inv.holdedContactId &&
      partnerSet.has(partnerKey(inv.companyId, inv.holdedContactId))
    ) {
      const existing = contactsByCompany.get(inv.companyId);
      if (existing) {
        existing.contactIds.add(inv.holdedContactId);
      } else {
        contactsByCompany.set(inv.companyId, {
          apiKey: inv.company.holdedApiKey,
          contactIds: new Set([inv.holdedContactId]),
        });
      }
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

    if (effectivePending <= 0.005) continue;

    companyNames.add(inv.company.name);

    if (inv.type === "PURCHASE") {
      const isPartner =
        inv.holdedContactId != null &&
        partnerSet.has(partnerKey(inv.companyId, inv.holdedContactId));
      if (!isPartner) continue;

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
        contactIban: inv.holdedContactId ? (ibanMap.get(inv.holdedContactId) ?? null) : null,
        contactHoldedUrl: inv.holdedContactId
          ? `https://app.holded.com/contacts/${inv.holdedContactId}`
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
