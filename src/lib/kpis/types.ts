export interface KPIFilters {
  year?: number
  dateFrom?: Date
  dateTo?: Date
  /** 'consolidated' or a Company.id */
  companyId?: string
  /** Invoice.marca value */
  marca?: string
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

// ─── Full response ────────────────────────────────────────────────────────────

export interface KPIResponse {
  pl?: PLKPIs[]
  cashflow?: CashflowKPIs
  derived?: DerivedKPIs
  projections?: ProjectionKPIs
  dataQuality: {
    unclassifiedCount: number
  }
  generatedAt: string
}
