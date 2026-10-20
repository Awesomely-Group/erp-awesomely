import { prisma } from "@/lib/prisma";
import { semaforoLevel } from "@/lib/kpis/semaforo";
import type { BadgeBuilder } from "./kpi-cards";

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Metas `ads_*` del mes (KpiTarget MONTH) para el semáforo de las tarjetas. Misma
 * preferencia que kpi-semaforo.tsx: la meta más específica gana (marca+línea > marca >
 * global). Con `periodKey` null (el rango no es un mes) no hay nada que juzgar y el
 * builder no pinta etiqueta.
 */
export async function getAdsTargetBadgeBuilder({
  marca,
  lineOfBusiness,
  periodKey,
}: {
  marca: string | null | undefined;
  lineOfBusiness: string | null | undefined;
  periodKey: string | null;
}): Promise<BadgeBuilder> {
  if (!periodKey) return () => undefined;

  const targets = await prisma.kpiTarget.findMany({
    where: {
      periodType: "MONTH",
      periodKey,
      metric: { startsWith: "ads_" },
      OR: [{ marca: marca ?? null }, { marca: null }],
    },
  });
  const byMetric = new Map<string, number>();
  for (const t of targets) {
    if (t.lineOfBusiness && t.lineOfBusiness !== lineOfBusiness) continue;
    const specific = (t.marca ? 2 : 0) + (t.lineOfBusiness ? 1 : 0);
    const current = byMetric.get(t.metric);
    if (current === undefined || specific >= 1) byMetric.set(t.metric, Number(t.value));
  }

  return (metric, value, direction, fmt) => {
    const target = byMetric.get(metric);
    if (target === undefined) return { text: "sin meta", level: null };
    return { text: `meta ${fmt(target)}`, level: value === null ? null : semaforoLevel(value, target, direction) };
  };
}
