// Las dos "matrices" de optimización que mira la agencia (reunión 2026-10-16): qué
// keywords gastan más y qué términos de búsqueda reales disparan los anuncios y cuánto
// cuestan. Lógica pura sobre las filas diarias de ad_keyword_stats / ad_search_term_stats:
// se agregan por clave natural sin fecha para el rango que se esté mirando.
import { ratio } from "@/lib/kpis/campaigns-math";

interface BaseRow {
  adGroupId: string;
  adGroupName: string;
  /** "YYYY-MM-DD" */
  date: string;
  impressions: number;
  clicks: number;
  costEur: number;
  conversions: number;
}

export interface KeywordStatRow extends BaseRow {
  criterionId: string;
  keywordText: string;
  matchType: string;
  qualityScore: number | null;
}

export interface SearchTermStatRow extends BaseRow {
  searchTerm: string;
  matchType: string;
  status: string | null;
}

interface MatrixMetrics {
  impressions: number;
  clicks: number;
  costEur: number;
  conversions: number;
  ctrPct: number | null;
  cpcEur: number | null;
  convRatePct: number | null;
  cplEur: number | null;
}

export interface KeywordMatrixRow extends MatrixMetrics {
  key: string;
  adGroupName: string;
  keywordText: string;
  matchType: string;
  /** Del día más reciente que lo trajo: es un valor actual, no histórico. */
  qualityScore: number | null;
}

export interface SearchTermMatrixRow extends MatrixMetrics {
  key: string;
  adGroupName: string;
  searchTerm: string;
  matchType: string;
  status: string | null;
  /** Gasta clics y no convierte: lo primero que la agencia revisa para excluir. */
  isNegativeCandidate: boolean;
}

/** Umbral orientativo: con 7 €/día, tres clics sin lead ya son una señal. */
export const NEGATIVE_CANDIDATE_MIN_CLICKS = 3;

function finish<T extends MatrixMetrics>(row: T): T {
  row.costEur = Math.round(row.costEur * 100) / 100;
  row.ctrPct = ratio(row.clicks, row.impressions) !== null ? (row.clicks / row.impressions) * 100 : null;
  row.cpcEur = ratio(row.costEur, row.clicks);
  row.convRatePct = ratio(row.conversions, row.clicks) !== null ? (row.conversions / row.clicks) * 100 : null;
  row.cplEur = ratio(row.costEur, row.conversions);
  return row;
}

const byCostDesc = <T extends MatrixMetrics>(a: T, b: T): number => b.costEur - a.costEur || b.clicks - a.clicks || b.impressions - a.impressions;

export function aggregateKeywords(rows: ReadonlyArray<KeywordStatRow>): KeywordMatrixRow[] {
  const acc = new Map<string, KeywordMatrixRow & { qsDate: string | null }>();
  for (const r of rows) {
    const key = `${r.adGroupId}:${r.criterionId}`;
    let cur = acc.get(key);
    if (!cur) {
      cur = {
        key,
        adGroupName: r.adGroupName,
        keywordText: r.keywordText,
        matchType: r.matchType,
        qualityScore: null,
        qsDate: null,
        impressions: 0,
        clicks: 0,
        costEur: 0,
        conversions: 0,
        ctrPct: null,
        cpcEur: null,
        convRatePct: null,
        cplEur: null,
      };
      acc.set(key, cur);
    }
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.costEur += r.costEur;
    cur.conversions += r.conversions;
    if (r.qualityScore !== null && (cur.qsDate === null || r.date > cur.qsDate)) {
      cur.qualityScore = r.qualityScore;
      cur.qsDate = r.date;
    }
  }
  return [...acc.values()]
    .map((row) => {
      const { qsDate: _ignored, ...rest } = row;
      void _ignored;
      return finish(rest);
    })
    .sort(byCostDesc);
}

export function aggregateSearchTerms(rows: ReadonlyArray<SearchTermStatRow>): SearchTermMatrixRow[] {
  const acc = new Map<string, SearchTermMatrixRow & { lastDate: string }>();
  for (const r of rows) {
    const key = `${r.adGroupId}:${r.searchTerm.toLowerCase()}:${r.matchType}`;
    let cur = acc.get(key);
    if (!cur) {
      cur = {
        key,
        adGroupName: r.adGroupName,
        searchTerm: r.searchTerm,
        matchType: r.matchType,
        status: r.status,
        lastDate: r.date,
        isNegativeCandidate: false,
        impressions: 0,
        clicks: 0,
        costEur: 0,
        conversions: 0,
        ctrPct: null,
        cpcEur: null,
        convRatePct: null,
        cplEur: null,
      };
      acc.set(key, cur);
    }
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    cur.costEur += r.costEur;
    cur.conversions += r.conversions;
    // El estado (añadida/excluida) es el más reciente: si ayer se excluyó, hoy ya no gasta.
    if (r.date >= cur.lastDate) {
      cur.status = r.status;
      cur.lastDate = r.date;
    }
  }
  return [...acc.values()]
    .map((row) => {
      const { lastDate: _ignored, ...rest } = row;
      void _ignored;
      const out = finish(rest);
      out.isNegativeCandidate = out.clicks >= NEGATIVE_CANDIDATE_MIN_CLICKS && out.conversions === 0 && out.status !== "EXCLUDED";
      return out;
    })
    .sort(byCostDesc);
}
