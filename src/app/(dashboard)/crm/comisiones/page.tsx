import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { MARCA_OPTIONS } from "@/lib/org";
import { CommissionsView } from "./commissions-view";

export default async function ComisionesPage(): Promise<React.JSX.Element> {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const userId = session?.user?.id;

  const [commissions, rules] = await Promise.all([
    prisma.commission.findMany({
      where: isAdmin ? {} : userId ? { userId } : { id: "__none__" },
      include: {
        user: { select: { name: true, email: true } },
        lead: { select: { id: true, name: true } },
      },
      orderBy: { triggeredAt: "desc" },
      take: 200,
    }),
    isAdmin
      ? prisma.commissionRule.findMany()
      : Promise.resolve([]),
  ]);

  const ruleByMarca = new Map(rules.map((r) => [r.marca, r]));

  return (
    <CommissionsView
      isAdmin={isAdmin}
      commissions={commissions.map((c) => ({
        id: c.id,
        type: c.type,
        marca: c.marca,
        amount: Number(c.amount),
        status: c.status,
        triggeredAt: c.triggeredAt.toISOString(),
        userLabel: c.user.name ?? c.user.email,
        leadId: c.lead?.id ?? null,
        leadName: c.lead?.name ?? null,
      }))}
      rules={MARCA_OPTIONS.map((m) => {
        const r = ruleByMarca.get(m.value);
        return {
          marca: m.value,
          proposalPercent: r ? Number(r.proposalPercent) : 10,
          qualifiedMeetingAmount: r ? Number(r.qualifiedMeetingAmount) : 20,
          active: r?.active ?? false,
        };
      })}
    />
  );
}
