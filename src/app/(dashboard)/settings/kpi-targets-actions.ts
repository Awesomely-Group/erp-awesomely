"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import type { KpiTargetPeriodType } from "@prisma/client";
import { ADS_TARGET_DEFAULTS, ADS_TARGET_SCOPE, isMonthKey, type AdsTargetPhase } from "@/lib/ads-targets-defaults";

interface KpiTargetPayload {
  metric: string;
  marca?: string | null;
  lineOfBusiness?: string | null;
  periodType: KpiTargetPeriodType;
  periodKey: string;
  value: number;
}

/**
 * Metas de KPI (Growth, revisión 2026-09-18 — impacto plan Odoo): solo ADMIN las
 * edita. Las metas comerciales no tienen valores por defecto (las cifras del deck de
 * Odoo son una plantilla sin aprobar); las de campañas de pago sí, desde 2026-10-20:
 * los números de la agencia, cargables con `applyAdsTargetDefaults` y editables después.
 */
export async function createKpiTarget(payload: KpiTargetPayload): Promise<void> {
  await requireAdmin();
  const metric = payload.metric.trim();
  if (!metric) throw new Error("La métrica no puede estar vacía");
  await prisma.kpiTarget.create({
    data: {
      metric,
      marca: payload.marca || null,
      lineOfBusiness: payload.lineOfBusiness || null,
      periodType: payload.periodType,
      periodKey: payload.periodKey,
      value: payload.value,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/crm");
}

export async function deleteKpiTarget(id: string): Promise<void> {
  await requireAdmin();
  await prisma.kpiTarget.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/crm");
}

/** Cambia solo el valor de una meta existente (edición inline en /settings). */
export async function updateKpiTargetValue(id: string, value: number): Promise<void> {
  await requireAdmin();
  if (!Number.isFinite(value) || value < 0) throw new Error("La meta tiene que ser un número ≥ 0");
  await prisma.kpiTarget.update({ where: { id }, data: { value } });
  revalidatePath("/settings");
  revalidatePath("/crm");
  revalidatePath("/campanas");
}

/**
 * Carga las metas por defecto de campañas de pago para un mes (Gigson Solutions / ODOO).
 * Solo crea las que no existen: una meta ya editada a mano nunca se pisa. Devuelve
 * cuántas se han creado.
 */
export async function applyAdsTargetDefaults(phase: AdsTargetPhase, monthKey: string): Promise<number> {
  await requireAdmin();
  if (!isMonthKey(monthKey)) throw new Error("El mes tiene que ser YYYY-MM");
  const defaults = ADS_TARGET_DEFAULTS[phase];
  const result = await prisma.kpiTarget.createMany({
    data: defaults.map((d) => ({
      metric: d.metric,
      marca: ADS_TARGET_SCOPE.marca,
      lineOfBusiness: ADS_TARGET_SCOPE.lineOfBusiness,
      periodType: "MONTH",
      periodKey: monthKey,
      value: d.value,
    })),
    skipDuplicates: true,
  });
  revalidatePath("/settings");
  revalidatePath("/campanas");
  return result.count;
}
