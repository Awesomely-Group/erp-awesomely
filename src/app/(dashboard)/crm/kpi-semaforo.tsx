import { prisma } from "@/lib/prisma";
import { getCommercialKPIs } from "@/lib/kpis";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { SEMAFORO_CLASSES, semaforoLevel } from "@/lib/kpis/semaforo";

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
    // Medible desde que el lead y la oportunidad son dos cosas (2026-10-13): antes, un
    // lead descartado y una oportunidad perdida caían los dos en "Perdido".
    key: "tasa_cualificacion_pct",
    label: "Leads que cualifican",
    getValue: (k) => k.qualificationRatePct,
    format: (v) => `${v.toFixed(0)}%`,
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

// Todas las métricas de este semáforo son "más es mejor"; la dirección inversa (CPC, CPL)
// vive en /campanas. La lógica compartida está en src/lib/kpis/semaforo.ts.
function semaforoColor(value: number, target: number): string {
  const level = semaforoLevel(value, target, "higher");
  return level ? SEMAFORO_CLASSES[level] : "bg-gray-100 text-gray-500";
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
