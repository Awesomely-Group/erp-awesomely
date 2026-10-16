import type { CrmDealType } from "@prisma/client"

export interface KPIFilters {
  year?: number
  dateFrom?: Date
  dateTo?: Date
  /** 'consolidated' or a Company.id */
  companyId?: string
  /** Invoice.marca value */
  marca?: string
  /**
   * CrmStage/CrmDeal.lineOfBusiness (Growth, revisión 2026-09-18) — solo se usa en
   * getCommercialKPIs(). Una marca sin líneas de negocio distintas usa "GENERAL".
   */
  lineOfBusiness?: string
  /**
   * CrmDeal.dealType (revisión 2026-09-20) — solo en getCommercialKPIs(). Los objetivos
   * de captación ("9 implantaciones de Odoo en el año 1") cuentan ventas nuevas: con una
   * oportunidad por frente de trabajo, un retainer genera ampliaciones que las inflarían.
   * Para medirlos hay que pasar `dealType: "NEW_BUSINESS"` explícitamente.
   */
  dealType?: CrmDealType
  /** AdCampaign.id (Growth > Campañas, 2026-10-16) — solo en getCampaignKPIs(). */
  campaignId?: string
}

// ─── P&L KPIs ─────────────────────────────────────────────────────────────────

export interface PLKPIs {
  year: number
  companyId: string
  companyName: string
  ventas: number
  aprovisionamientos: number
  margenBruto: number
  margenBrutoPct: number
  otrosGastosExplotacion: number
  gastosPersonal: number
  ebitda: number
  ebitdaPct: number
  amortizacion: number
  ebit: number
  resultadoFinanciero: number
  resultadoAntesImpuestos: number
  impuestoBeneficios: number
  resultadoEjercicio: number
  resultadoEjercicioPct: number
}

// ─── Cashflow KPIs ────────────────────────────────────────────────────────────

export interface CashflowKPIs {
  dateFrom: string
  dateTo: string
  totalInflows: number
  totalOutflows: number
  netCashflow: number
  operationalCoverage: number | null
  /** Monthly breakdown */
  monthly: Array<{
    monthKey: string
    monthLabel: string
    inflows: number
    outflows: number
    net: number
    cumulativeNet: number
  }>
}

// ─── Derived KPIs ─────────────────────────────────────────────────────────────

export interface DerivedKPIs {
  year: number
  annualRunRate: number | null
  monthlyBurnRate: number | null
  unclassifiedInvoices: { count: number; totalEur: number }
  pendingCollection: { count: number; totalEur: number }
  pendingPayment: { count: number; totalEur: number }
  monthsElapsed: number
}

// ─── Projection KPIs ──────────────────────────────────────────────────────────

export interface ProjectionKPIs {
  basePeriodMonths: number
  variationPct: number
  avgInflows: number
  avgOutflows: number
  horizons: Array<{
    months: 3 | 6 | 9 | 12
    baselineNet: number
    optimisticNet: number
    pessimisticNet: number
    baselineInflows: number
    baselineOutflows: number
  }>
}

// ─── Commercial KPIs (Growth/CRM, revisión 2026-09-18) ─────────────────────────
//
// Reutiliza el mismo framework que el resto de grupos (KPIFilters → getXxxKPIs()),
// en vez de un módulo de KPIs aparte para el CRM. `lineOfBusiness` distingue
// embudos dentro de una misma marca (p.ej. Gigson Solutions: Integraciones/IA vs
// Odoo) — agregar solo por `marca` mezclaría conversiones que no significan nada.

export interface CommercialFunnelStage {
  stageId: string
  stageName: string
  order: number
  isWon: boolean
  isLost: boolean
  /** Leads actualmente en esta etapa (foto del momento, no acumulado del periodo). */
  openCount: number
  openAmount: number
}

export interface CommercialKPIs {
  marca?: string
  lineOfBusiness?: string
  dateFrom: string
  dateTo: string
  /** Leads creados en el periodo filtrado. Boca del embudo, antes de cualificar. */
  leadsCreated: number
  leadsByOrigin: Record<string, number>
  /**
   * Leads creados en el periodo que llegaron a cualificarse (`convertedAt` dentro del
   * periodo). Es el numerador de `qualificationRatePct`.
   */
  leadsQualified: number
  /**
   * Cuántos de los leads entrados se convirtieron en oportunidad. Separar lead de deal
   * (2026-10-13) es lo que hace medible este salto: antes un lead descartado y una
   * oportunidad perdida caían en la misma etapa "Perdido" y no se distinguían.
   * `null` si no entró ningún lead en el periodo.
   */
  qualificationRatePct: number | null
  /** Oportunidades creadas en el periodo filtrado. */
  dealsCreated: number
  /**
   * Mezcla de negocio nuevo, ampliación y renovación. Se devuelve siempre, también
   * cuando no se filtra por `dealType`, para que se vea cuánto de lo contado es venta
   * nueva de verdad sin tener que lanzar una segunda consulta.
   */
  dealsByType: Record<string, number>
  wonCount: number
  lostCount: number
  winRatePct: number | null
  avgDealSize: number | null
  /**
   * Días de la oportunidad: de su creación a la etapa ganada. No incluye lo que el lead
   * tardó en cualificarse — eso es `avgTimeToQualifyDays`, que mide otra cosa y lo hace
   * otro equipo.
   */
  avgCycleDays: number | null
  /** Días entre la entrada del lead y su cualificación, para los ganados en el periodo. */
  avgTimeToQualifyDays: number | null
  /** Foto actual (no filtrada por fecha de creación): deals abiertos × probabilidad. */
  weightedPipeline: number
  funnel: CommercialFunnelStage[]
}

// ─── Campaign KPIs (Growth > Campañas, revisión 2026-10-16) ─────────────────────
//
// KPIs de campañas de pago (Google Ads) tal como los planteó la agencia (Holdmin) en la
// reunión del 2026-10-16: CTR, CPC, tasa de conversión y CPL por campaña, con histórico.
// Cada ratio sale en dos versiones: con las conversiones que cuenta Google Ads (dependen
// de que el visitante acepte cookies: son un mínimo) y con los leads reales del CRM
// atribuidos a la campaña (`CrmLead.adCampaignId`), que es la cifra que manda.

export interface CampaignMetricSet {
  impressions: number
  clicks: number
  costEur: number
  /** Conversiones que reporta Google Ads (fraccionales con atribución data-driven). */
  conversionsAds: number
  /** Leads del CRM atribuidos a la campaña, contados en su fecha de entrada. */
  leadsCrm: number
  /** De esos leads, los que se cualificaron (CrmLead.convertedAt). */
  leadsQualified: number
  /** Oportunidades ganadas nacidas de esos leads. */
  dealsWon: number
  /** clics / impresiones × 100 */
  ctrPct: number | null
  /** coste / clics */
  cpcEur: number | null
  /** conversiones Ads / clics × 100 */
  convRateAdsPct: number | null
  /** leads CRM / clics × 100 — la tasa de conversión "de verdad" */
  convRateCrmPct: number | null
  /** coste / conversiones Ads */
  cplAdsEur: number | null
  /** coste / leads CRM — el CPL de las tarjetas */
  cplCrmEur: number | null
  /** coste / leads cualificados */
  cplQualifiedEur: number | null
  /** coste / oportunidades ganadas (CPA) */
  cpaEur: number | null
  /** % de impresiones perdidas por presupuesto, ponderado por impresiones. */
  lostIsBudgetPct: number | null
  lostIsRankPct: number | null
}

export interface CampaignSeriesPoint extends CampaignMetricSet {
  /** "2026-10-16" (día) o "2026-W42" (semana ISO). */
  periodKey: string
  /** "16 oct" o "S42 · 12 oct". */
  label: string
}

export interface CampaignBudgetStatus {
  monthKey: string
  spentMtdEur: number
  /** Suma de presupuestos diarios de las campañas activas del scope. */
  dailyBudgetEur: number | null
  /** presupuesto diario × días del mes */
  monthlyBudgetEur: number | null
  /** presupuesto diario × días transcurridos del mes (hoy incluido) */
  expectedToDateEur: number | null
  /** gastado / esperado × 100. 100 = al ritmo. */
  pacePct: number | null
}

export interface CampaignRow extends CampaignMetricSet {
  campaignId: string
  externalId: string
  name: string
  status: string
  marca: string | null
  lineOfBusiness: string | null
  dailyBudgetEur: number | null
  /** Tiene marca y línea de negocio: se puede cruzar con el CRM. */
  isMapped: boolean
  /** Último día con datos dentro del rango, "YYYY-MM-DD". */
  lastDate: string | null
}

export interface CampaignKPIs {
  marca?: string
  lineOfBusiness?: string
  campaignId?: string
  dateFrom: string
  dateTo: string
  granularity: "day" | "week"
  totals: CampaignMetricSet
  budget: CampaignBudgetStatus
  series: CampaignSeriesPoint[]
  campaigns: CampaignRow[]
  /** Último volcado correcto del script (lote de campañas) y qué lotes trajo esa ejecución. */
  lastImport: { receivedAt: string; runId: string; kinds: string[] } | null
  /** Horas desde el último volcado correcto; null si nunca ha llegado ninguno. */
  staleHours: number | null
}

// ─── Full response ────────────────────────────────────────────────────────────

export interface KPIResponse {
  pl?: PLKPIs[]
  cashflow?: CashflowKPIs
  derived?: DerivedKPIs
  projections?: ProjectionKPIs
  commercial?: CommercialKPIs
  campaigns?: CampaignKPIs
  dataQuality: {
    unclassifiedCount: number
  }
  generatedAt: string
}
