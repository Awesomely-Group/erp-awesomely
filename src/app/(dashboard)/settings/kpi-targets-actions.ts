"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/roles";
import type { KpiTargetPeriodType } from "@prisma/client";

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
 * edita. El ERP no siembra valores por defecto (ver scripts/seed-growth-crm.ts) —
 * las cifras del deck de Odoo son una plantilla sin aprobar.
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
