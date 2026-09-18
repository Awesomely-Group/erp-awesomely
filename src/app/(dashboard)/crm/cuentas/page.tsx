import { prisma } from "@/lib/prisma";
import { AccountsView } from "./accounts-view";

export default async function CuentasPage(): Promise<React.JSX.Element> {
  const accounts = await prisma.crmAccount.findMany({
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { leads: true, contacts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AccountsView
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        marca: a.marca,
        lifecycle: a.lifecycle,
        ownerLabel: a.owner ? (a.owner.name ?? a.owner.email) : null,
        leadsCount: a._count.leads,
        contactsCount: a._count.contacts,
        hasHoldedContact: !!a.holdedContactId,
      }))}
    />
  );
}
