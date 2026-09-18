import { prisma } from "@/lib/prisma";
import { getCommercialKPIs } from "@/lib/kpis";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface MetricDef {
  key: string;
  label: string;
  getValue: (kpis: Awaited<ReturnType<typeof getCommercialKPIs>>) => number | null;
  format: (v: number) => string;
}

const METRICS: MetricDef[] = [
  {
    key: "leads_mes",
    label: "Leads este mes",
    getValue: (k) => k.leadsCreated,
    format: (v) => String(v),
  },
  {
    key: "win_rate_pct",
    label: "Win rate",
    getValue: (k) => k.winRatePct,
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    key: "pipeline_ponderado",
    label: "Pipeline ponderado",
    getValue: (k) => k.weightedPipeline,
    format: (v) => formatCurrency(v),
  },
];

function semaforoColor(value: number, target: number): string {
  const pct = target !== 0 ? (value / target) * 100 : 0;
  if (pct >= 100) return "bg-emerald-100 text-emerald-700";
  if (pct >= 70) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

/**
 * Semáforo de metas comerciales (Growth, revisión 2026-09-18 — impacto plan Odoo):
 * rutina mensual Verde/Ámbar/Rojo sobre las métricas con `KpiTarget` configurado para
 * el mes en curso. Sin meta configurada, se muestra el número en gris (informativo,
 * sin juicio). Nada se cablea: si no hay ninguna fila en `KpiTarget`, todo sale gris.
 */
export async function KpiSemaforo({
  marca,
  lineOfBusiness,
}: {
  marca: string;
  lineOfBusiness: string;
}): Promise<React.JSX.Element> {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [kpis, targets] = await Promise.all([
    getCommercialKPIs({ marca, lineOfBusiness, dateFrom, dateTo }),
    prisma.kpiTarget.findMany({
      where: {
        periodType: "MONTH",
        periodKey: monthKey,
        metric: { in: METRICS.map((m) => m.key) },
        OR: [{ marca }, { marca: null }],
      },
    }),
  ]);

  // Preferir el target más específico (marca+línea > marca > global) por métrica.
  const targetByMetric = new Map<string, number>();
  for (const t of targets) {
    if (t.lineOfBusiness && t.lineOfBusiness !== lineOfBusiness) continue;
    const specificity = (t.marca ? 2 : 0) + (t.lineOfBusiness ? 1 : 0);
    const current = targetByMetric.get(t.metric);
    if (current === undefined || specificity >= 1) targetByMetric.set(t.metric, Number(t.value));
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {METRICS.map((m) => {
        const value = m.getValue(kpis);
        const target = targetByMetric.get(m.key);
        return (
          <div key={m.key} className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{m.label}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold text-gray-900">
                {value !== null ? m.format(value) : "—"}
              </span>
              {target !== undefined && value !== null ? (
                <span
                  className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", semaforoColor(value, target))}
                >
                  meta {m.format(target)}
                </span>
              ) : (
                <span className="text-[11px] text-gray-300">sin meta</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
