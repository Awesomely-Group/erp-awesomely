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
   * CrmStage/CrmLead.lineOfBusiness (Growth, revisión 2026-09-18) — solo se usa en
   * getCommercialKPIs(). Una marca sin líneas de negocio distintas usa "GENERAL".
   */
  lineOfBusiness?: string
  /**
   * CrmLead.dealType (revisión 2026-09-20) — solo en getCommercialKPIs(). Los objetivos
   * de captación ("9 implantaciones de Odoo en el año 1") cuentan ventas nuevas: con una
   * oportunidad por frente de trabajo, un retainer genera ampliaciones que las inflarían.
   * Para medirlos hay que pasar `dealType: "NEW_BUSINESS"` explícitamente.
   */
  dealType?: CrmDealType
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
  /** Leads creados en el periodo filtrado. */
  leadsCreated: number
  leadsByOrigin: Record<string, number>
  /**
   * Mezcla de negocio nuevo, ampliación y renovación. Se devuelve siempre, también
   * cuando no se filtra por `dealType`, para que se vea cuánto de lo contado es venta
   * nueva de verdad sin tener que lanzar una segunda consulta.
   */
  leadsByDealType: Record<string, number>
  wonCount: number
  lostCount: number
  winRatePct: number | null
  avgDealSize: number | null
  avgCycleDays: number | null
  /** Foto actual (no filtrada por fecha de creación): leads abiertos × probabilidad. */
  weightedPipeline: number
  funnel: CommercialFunnelStage[]
}

// ─── Full response ────────────────────────────────────────────────────────────

export interface KPIResponse {
  pl?: PLKPIs[]
  cashflow?: CashflowKPIs
  derived?: DerivedKPIs
  projections?: ProjectionKPIs
  commercial?: CommercialKPIs
  dataQuality: {
    unclassifiedCount: number
  }
  generatedAt: string
}
