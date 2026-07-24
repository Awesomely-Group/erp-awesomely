import { prisma } from "./prisma";

// ─── Budget constants (hardcoded from Ppto_vs_Real_2026_v2.xlsx) ─────────────

// Budget totals for H1 2026 by project key (jiraKey).
// Keys may need adjustment once actual jiraKey values are confirmed in prod.
export const BUDGET_INGRESOS: Record<string, Record<string, number>> = {
  LaTroupe: {
    MO_OroHatoRey:     18000,
    BDG_LegoLondonHub: 33608,
    BDG_AlAmeenHQ:      4702,
    AIRIA_LoteEsteBM:  24000,
    AL_SG:              5000,
    RAD_RadissonBlue:  96000,
    MO_MayaliahTulum:  32000,
  },
  Gigson: {
    "GS-ModaRe":        22500,
    "GS-Colvin":         8400,
    "GS-Quicksmile":     2800,
    "GS-LaVega":         1640,
  },
};

export const BUDGET_COGS: Record<string, Record<string, number>> = {
  LaTroupe: {
    MO_OroHatoRey:     12000,
    BDG_LegoLondonHub: 19200,
    BDG_AlAmeenHQ:      4702,
    AIRIA_LoteEsteBM:  19200,
    AL_SG:              3500,
    RAD_RadissonBlue:  76800,
    MO_MayaliahTulum:  28000,
  },
  Gigson: {
    "GS-ModaRe":       12000,
    "GS-Colvin":        4400,
    "GS-Quicksmile":    1180,
    "GS-LaVega":         992,
  },
};

export const BUDGET_TOTALS: Record<string, {
  totalIngresos: number;
  totalCogs: number;
  margenBruto: number;
  opexDirecto: number;
  ebitdaPreRecharge: number;
  rechargeAW: number;
  ebitdaPostRecharge: number;
}> = {
  LaTroupe: {
    totalIngresos:    213310,
    totalCogs:        163402,
    margenBruto:       49908,
    opexDirecto:           0,
    ebitdaPreRecharge: 49908,
    rechargeAW:       -59894,
    ebitdaPostRecharge:-9986,
  },
  Gigson: {
    totalIngresos:    35340,
    totalCogs:        18572,
    margenBruto:      16768,
    opexDirecto:          0,
    ebitdaPreRecharge:16768,
    rechargeAW:      -25669,
    ebitdaPostRecharge:-8901,
  },
  Awesomely: {
    totalIngresos:        0,
    totalCogs:            0,
    margenBruto:          0,
    opexDirecto:      85067,
    ebitdaPreRecharge:-85067,
    rechargeAW:        85067, // recharged out (positive = recovered)
    ebitdaPostRecharge:    0,
  },
  Consolidado: {
    totalIngresos:   248650,
    totalCogs:       181975,
    margenBruto:      66676,
    opexDirecto:      85067,
    ebitdaPreRecharge:-18392,
    rechargeAW:           0,
    ebitdaPostRecharge:-18392,
  },
};

export const BUDGET_AW_OPEX: Record<string, number> = {
  "Personal estructura":    59408,
  "Marketing":               8419,
  "Marca personal (Jaume)":  5400,
  "Informática":             1552,
  "Gestorías / Legal":       7656,
  "Alquiler":                2631,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type PlProjectRow = {
  projectKey: string;
  projectName: string;
  months: number[]; // 6 values Jan–Jun, absolute amounts
  total: number;
  budget: number | null;
};

export type PlSummaryRow = {
  months: number[]; // 6 values
  total: number;
  budget: number | null;
};

export type PlCategoryRow = {
  category: string;
  months: number[];
  total: number;
  budget: number | null;
};

export type PptoRealMarcaData = {
  marca: string;
  ingresosRows: PlProjectRow[];
  totalIngresos: PlSummaryRow;
  cogsRows: PlProjectRow[];
  totalCogs: PlSummaryRow;
  margenBruto: PlSummaryRow;
  opexDirecto: PlSummaryRow;
  ebitdaPreRecharge: PlSummaryRow;
  rechargeAW: PlSummaryRow;
  ebitdaPostRecharge: PlSummaryRow;
  awOpexRows: PlCategoryRow[]; // only for Awesomely tab
};

// ─── Raw query ────────────────────────────────────────────────────────────────

type RawPlRow = {
  month: Date;
  invoice_type: string;
  effective_marca: string | null;
  project_id: string | null;
  project_key: string | null;
  project_name: string | null;
  counterparty: string | null;
  subtotal_eur: unknown;
};

async function fetchRawPlData(): Promise<RawPlRow[]> {
  return prisma.$queryRaw<RawPlRow[]>`
    SELECT
      DATE_TRUNC('month', COALESCE(i."accountingMonth", i.date)) AS month,
      i.type                                                       AS invoice_type,
      COALESCE(c.marca, i.marca)                                   AS effective_marca,
      c."projectId"                                                AS project_id,
      p."jiraKey"                                                  AS project_key,
      p.name                                                       AS project_name,
      i.counterparty                                               AS counterparty,
      SUM(il.subtotal * i."fxRateToEur")                           AS subtotal_eur
    FROM invoices i
    JOIN invoice_lines il ON il."invoiceId" = i.id
    LEFT JOIN classifications c ON c."invoiceLineId" = il.id
    LEFT JOIN jira_projects p ON c."projectId" = p.id
    WHERE COALESCE(i."accountingMonth", i.date) >= ${new Date("2026-01-01")}
      AND COALESCE(i."accountingMonth", i.date) <  ${new Date("2026-07-01")}
    GROUP BY 1, 2, 3, 4, 5, 6, 7
    ORDER BY 1
  `;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthIndex(d: Date): number {
  return new Date(d).getMonth(); // 0 = Jan, 5 = Jun
}

function zeros(): number[] {
  return new Array(6).fill(0);
}

function sumRow(months: number[]): number {
  return months.reduce((s, v) => s + v, 0);
}

function addMonths(a: number[], b: number[]): number[] {
  return a.map((v, i) => v + b[i]);
}

function subtractMonths(a: number[], b: number[]): number[] {
  return a.map((v, i) => v - b[i]);
}

function isGigson(m: string | null): boolean {
  return m === "Gigson" || m === "Gigson Solutions";
}

function matchesMarca(m: string | null, target: string): boolean {
  if (!m) return false;
  if (target === "Gigson") return isGigson(m);
  return m === target;
}

// ─── Builder ─────────────────────────────────────────────────────────────────

function buildMarca(
  rows: RawPlRow[],
  marca: string,
  awOpexMonthsByCategory: Map<string, number[]>
): PptoRealMarcaData {
  const budgetIngByKey = BUDGET_INGRESOS[marca] ?? {};
  const budgetCogsByKey = BUDGET_COGS[marca] ?? {};
  const budgetTotals = BUDGET_TOTALS[marca];

  const ingMap = new Map<string, { key: string; name: string; months: number[] }>();
  const cogsMap = new Map<string, { key: string; name: string; months: number[] }>();
  const opexDirectoMonths = zeros();
  const awMonths = zeros(); // Awesomely estructura

  for (const row of rows) {
    const idx = monthIndex(row.month);
    if (idx < 0 || idx > 5) continue;
    const amount = Number(row.subtotal_eur);
    const em = row.effective_marca;

    if (row.invoice_type === "SALE") {
      if (!matchesMarca(em, marca)) continue;
      const key = row.project_key ?? "__no-project__";
      const name = row.project_name ?? row.counterparty ?? "Sin proyecto";
      if (!ingMap.has(key)) ingMap.set(key, { key, name, months: zeros() });
      ingMap.get(key)!.months[idx] += amount;
    } else {
      // PURCHASE
      if (matchesMarca(em, marca)) {
        if (row.project_id !== null) {
          // COGS
          const key = row.project_key ?? "__no-project__";
          const name = row.project_name ?? row.counterparty ?? "Sin proyecto";
          if (!cogsMap.has(key)) cogsMap.set(key, { key, name, months: zeros() });
          cogsMap.get(key)!.months[idx] += amount;
        } else {
          // OPEX directo de la marca
          opexDirectoMonths[idx] += amount;
        }
      } else if (em === "Awesomely" || (em === null && row.invoice_type === "PURCHASE")) {
        // Counted in awesomely totals for recharge calculation (only if called from LT/GS)
        // These are gathered separately via awOpexMonthsByCategory
      }
    }
  }

  // Awesomely tab: populate awMonths from the prebuilt category map
  if (marca === "Awesomely") {
    for (const months of awOpexMonthsByCategory.values()) {
      months.forEach((v, i) => { awMonths[i] += v; });
    }
  }

  // Build INGRESOS rows
  const ingresosRows: PlProjectRow[] = Array.from(ingMap.values()).map(({ key, name, months }) => ({
    projectKey: key,
    projectName: name,
    months,
    total: sumRow(months),
    budget: budgetIngByKey[key] ?? null,
  }));
  ingresosRows.sort((a, b) => b.total - a.total);

  // Build COGS rows
  const cogsRows: PlProjectRow[] = Array.from(cogsMap.values()).map(({ key, name, months }) => ({
    projectKey: key,
    projectName: name,
    months,
    total: sumRow(months),
    budget: budgetCogsByKey[key] ?? null,
  }));
  cogsRows.sort((a, b) => b.total - a.total);

  // Totals
  const totalIngMonths = ingresosRows.reduce((acc, r) => addMonths(acc, r.months), zeros());
  const totalCogMonths = cogsRows.reduce((acc, r) => addMonths(acc, r.months), zeros());

  // For Awesomely tab, ingresos/cogs are 0
  const effectiveIngMonths = marca === "Awesomely" ? zeros() : totalIngMonths;
  const effectiveCogMonths = marca === "Awesomely" ? zeros() : totalCogMonths;

  const margenMonths = subtractMonths(effectiveIngMonths, effectiveCogMonths);
  const opexMonths = marca === "Awesomely" ? awMonths : opexDirectoMonths;
  const ebitdaPreMonths = subtractMonths(margenMonths, opexMonths);

  // Recharge: for LaTroupe = AW × 0.7, for Gigson = AW × 0.3, for Awesomely = total AW (positive, recovered)
  const awTotalMonths: number[] = zeros();
  for (const m of awOpexMonthsByCategory.values()) {
    m.forEach((v, i) => { awTotalMonths[i] += v; });
  }

  let rechargeMonths: number[];
  if (marca === "LaTroupe") {
    rechargeMonths = awTotalMonths.map((v) => -v * 0.7);
  } else if (marca === "Gigson") {
    rechargeMonths = awTotalMonths.map((v) => -v * 0.3);
  } else if (marca === "Awesomely") {
    rechargeMonths = awTotalMonths.map((v) => v); // recharged out = positive
  } else {
    rechargeMonths = zeros(); // Consolidado: cancels out
  }

  const ebitdaPostMonths = addMonths(ebitdaPreMonths, rechargeMonths);

  const toSummary = (months: number[], budget: number | null): PlSummaryRow => ({
    months,
    total: sumRow(months),
    budget,
  });

  // Awesomely opex rows by category
  const awOpexRows: PlCategoryRow[] = Array.from(awOpexMonthsByCategory.entries())
    .map(([cat, months]) => ({
      category: cat,
      months,
      total: sumRow(months),
      budget: BUDGET_AW_OPEX[cat] ?? null,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    marca,
    ingresosRows,
    totalIngresos: toSummary(effectiveIngMonths, budgetTotals?.totalIngresos ?? null),
    cogsRows,
    totalCogs: toSummary(effectiveCogMonths, budgetTotals?.totalCogs ?? null),
    margenBruto: toSummary(margenMonths, budgetTotals?.margenBruto ?? null),
    opexDirecto: toSummary(opexMonths, budgetTotals?.opexDirecto ?? null),
    ebitdaPreRecharge: toSummary(ebitdaPreMonths, budgetTotals?.ebitdaPreRecharge ?? null),
    rechargeAW: toSummary(rechargeMonths, budgetTotals?.rechargeAW ?? null),
    ebitdaPostRecharge: toSummary(ebitdaPostMonths, budgetTotals?.ebitdaPostRecharge ?? null),
    awOpexRows,
  };
}

function buildConsolidado(lt: PptoRealMarcaData, gs: PptoRealMarcaData): PptoRealMarcaData {
  const combineProjects = (a: PlProjectRow[], b: PlProjectRow[]): PlProjectRow[] => {
    const map = new Map<string, PlProjectRow>();
    for (const r of [...a, ...b]) {
      const existing = map.get(r.projectKey);
      if (existing) {
        existing.months = addMonths(existing.months, r.months);
        existing.total = sumRow(existing.months);
        if (existing.budget !== null && r.budget !== null) existing.budget += r.budget;
        else if (r.budget !== null) existing.budget = r.budget;
      } else {
        map.set(r.projectKey, { ...r, months: [...r.months] });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  };

  const budgetTotals = BUDGET_TOTALS["Consolidado"];

  const ingresosRows = combineProjects(lt.ingresosRows, gs.ingresosRows);
  const cogsRows = combineProjects(lt.cogsRows, gs.cogsRows);
  const totalIngMonths = ingresosRows.reduce((acc, r) => addMonths(acc, r.months), zeros());
  const totalCogMonths = cogsRows.reduce((acc, r) => addMonths(acc, r.months), zeros());
  const margenMonths = subtractMonths(totalIngMonths, totalCogMonths);
  // Consolidado OPEX = LaTroupe OPEX + Gigson OPEX + Awesomely OPEX (no recharge in consolidado)
  const opexMonths = addMonths(
    addMonths(lt.opexDirecto.months, gs.opexDirecto.months),
    // Add AW opex via lt recharge / 0.7
    lt.rechargeAW.months.map((v) => -v / 0.7)
  );
  const ebitdaMonths = subtractMonths(margenMonths, opexMonths);

  const toSummary = (months: number[], budget: number | null): PlSummaryRow => ({
    months,
    total: sumRow(months),
    budget,
  });

  return {
    marca: "Consolidado",
    ingresosRows,
    totalIngresos: toSummary(totalIngMonths, budgetTotals.totalIngresos),
    cogsRows,
    totalCogs: toSummary(totalCogMonths, budgetTotals.totalCogs),
    margenBruto: toSummary(margenMonths, budgetTotals.margenBruto),
    opexDirecto: toSummary(opexMonths, budgetTotals.opexDirecto),
    ebitdaPreRecharge: toSummary(ebitdaMonths, budgetTotals.ebitdaPreRecharge),
    rechargeAW: toSummary(zeros(), 0),
    ebitdaPostRecharge: toSummary(ebitdaMonths, budgetTotals.ebitdaPostRecharge),
    awOpexRows: [],
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getPptoRealData(): Promise<{
  LaTroupe: PptoRealMarcaData;
  Gigson: PptoRealMarcaData;
  Awesomely: PptoRealMarcaData;
  Consolidado: PptoRealMarcaData;
}> {
  const rows = await fetchRawPlData();

  // Build Awesomely OPEX by category (used for recharge calculation for all marcas)
  const awOpexByCategory = new Map<string, number[]>();
  for (const row of rows) {
    if (row.invoice_type !== "PURCHASE") continue;
    const em = row.effective_marca;
    if (em !== "Awesomely") continue;
    const idx = monthIndex(row.month);
    if (idx < 0 || idx > 5) continue;
    const amount = Number(row.subtotal_eur);
    // Use counterparty as category when accountingAccountName is unavailable
    const cat = row.project_name ?? row.counterparty ?? "Otros";
    if (!awOpexByCategory.has(cat)) awOpexByCategory.set(cat, zeros());
    awOpexByCategory.get(cat)![idx] += amount;
  }

  const LaTroupe = buildMarca(rows, "LaTroupe", awOpexByCategory);
  const Gigson = buildMarca(rows, "Gigson", awOpexByCategory);
  const Awesomely = buildMarca(rows, "Awesomely", awOpexByCategory);
  const Consolidado = buildConsolidado(LaTroupe, Gigson);

  return { LaTroupe, Gigson, Awesomely, Consolidado };
}
