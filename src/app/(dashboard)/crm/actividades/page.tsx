import { prisma } from "@/lib/prisma";
import { ActivitiesView } from "./activities-view";

export default async function ActividadesPage(): Promise<React.JSX.Element> {
  const activities = await prisma.crmActivity.findMany({
    where: { completedAt: null },
    include: { lead: { select: { id: true, name: true } }, account: { select: { id: true, name: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <ActivitiesView
      activities={activities.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        notes: a.notes,
        dueDate: a.dueDate?.toISOString() ?? null,
        leadId: a.lead?.id ?? null,
        leadName: a.lead?.name ?? null,
        accountName: a.account?.name ?? null,
      }))}
    />
  );
}
