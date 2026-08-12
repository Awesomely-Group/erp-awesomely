import { prisma } from "@/lib/prisma";
import { type Prisma } from "@prisma/client";
import { MARCA_FILTER_UNASSIGNED } from "@/lib/org";
import type { CashflowParams } from "@/lib/cashflow-data";

/** Resuelve el `where` de Forecast a partir de los filtros de marca/categoría/cuenta de la URL. */
export async function buildForecastWhere(params: CashflowParams): Promise<Prisma.ForecastWhereInput> {
  const where: Prisma.ForecastWhereInput = {};

  const marcaList = params.marca?.split(",").filter(Boolean) ?? [];
  if (marcaList.length > 0) {
    const hasUnassigned = marcaList.includes(MARCA_FILTER_UNASSIGNED);
    const namedMarcas = marcaList.filter((m) => m !== MARCA_FILTER_UNASSIGNED);
    const or: Prisma.ForecastWhereInput[] = [];
    if (hasUnassigned) or.push({ marca: null });
    if (namedMarcas.length > 0) or.push({ marca: { in: namedMarcas } });
    if (or.length > 0) where.OR = or;
  }

  const l1List = params.l1?.split(",").filter(Boolean) ?? [];
  const accountList = params.account?.split(",").filter(Boolean) ?? [];
  if (l1List.length > 0 || accountList.length > 0) {
    const mappings = await prisma.accountMapping.findMany({
      where: {
        ...(l1List.length > 0 ? { l1: { in: l1List } } : {}),
        ...(accountList.length > 0
          ? { OR: [{ accountNumSL: { in: accountList } }, { accountNumOU: { in: accountList } }] }
          : {}),
      },
      select: { id: true },
    });
    where.accountMappingId = { in: mappings.map((m) => m.id) };
  }

  return where;
}

/** Opciones ligeras (proyectos/cuentas/proveedores) necesarias para el formulario de alta,
 * sin traer el listado completo de previsiones — usado en la cabecera del dashboard. */
export async function getForecastFormOptions(): Promise<{
  projects: { id: string; name: string }[];
  accountMappings: { id: string; description: string; l1: string }[];
  suppliers: { id: string; name: string }[];
}> {
  const [projects, accountMappings, suppliers] = await Promise.all([
    prisma.jiraProject.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.accountMapping.findMany({
      where: { l1: { in: ["COGS", "OPEX", "CAPEX"] } },
      select: { id: true, description: true, l1: true },
      orderBy: [{ l1: "asc" }, { description: "asc" }],
    }),
    prisma.supplier.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { projects, accountMappings, suppliers };
}

export type ForecastListRow = Prisma.ForecastGetPayload<{
  select: {
    id: true;
    month: true;
    type: true;
    marca: true;
    projectId: true;
    project: { select: { id: true; name: true } };
    accountMappingId: true;
    accountMapping: { select: { id: true; description: true; l1: true } };
    supplierId: true;
    supplier: { select: { id: true; name: true } };
    description: true;
    amountOptimistic: true;
    amountPessimistic: true;
    recurrenceId: true;
    recurrence: { select: { id: true; frequency: true } };
    isPaused: true;
  };
}>;

/** Listado completo de previsiones manuales + opciones del formulario, para la pantalla de gestión. */
export async function getForecastsListData(params: CashflowParams): Promise<{
  forecasts: ForecastListRow[];
  projects: { id: string; name: string }[];
  accountMappings: { id: string; description: string; l1: string }[];
  suppliers: { id: string; name: string }[];
}> {
  const forecastWhere = await buildForecastWhere(params);

  const [forecasts, options] = await Promise.all([
    prisma.forecast.findMany({
      where: forecastWhere,
      select: {
        id: true,
        month: true,
        type: true,
        marca: true,
        projectId: true,
        project: { select: { id: true, name: true } },
        accountMappingId: true,
        accountMapping: { select: { id: true, description: true, l1: true } },
        supplierId: true,
        supplier: { select: { id: true, name: true } },
        description: true,
        amountOptimistic: true,
        amountPessimistic: true,
        recurrenceId: true,
        recurrence: { select: { id: true, frequency: true } },
        isPaused: true,
      },
      orderBy: [{ month: "asc" }],
    }),
    getForecastFormOptions(),
  ]);

  return { forecasts, ...options };
}
