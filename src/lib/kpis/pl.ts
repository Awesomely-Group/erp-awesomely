import { getPlData } from "@/lib/pl-data";
import type { KPIFilters, PLKPIs } from "./types";

export async function getPLKPIs(filters: KPIFilters): Promise<PLKPIs[]> {
  const year = filters.year ?? new Date().getFullYear();
  const data = await getPlData({ year: String(year) });

  const candidates =
    filters.companyId && filters.companyId !== "consolidated"
      ? data.entities.filter((e) => e.companyId === filters.companyId)
      : filters.companyId === "consolidated"
        ? [data.consolidated]
        : [data.consolidated, ...data.entities];

  return candidates.map((entity) => {
    const y = entity.yearly;
    const ventas = y.ventas;
    const aprovisionamientos = y.aprovisionamientos;
    const margenBruto = y.margen_bruto;
    const ebitda = y.ebitda;
    const ebit = y.ebit;
    const resultadoEjercicio = y.resultado_ejercicio;

    return {
      year,
      companyId: entity.companyId,
      companyName: entity.companyName,
      ventas,
      aprovisionamientos,
      margenBruto,
      margenBrutoPct: ventas !== 0 ? (margenBruto / ventas) * 100 : 0,
      otrosGastosExplotacion: y.otros_gastos_explotacion,
      gastosPersonal: y.gastos_personal,
      ebitda,
      ebitdaPct: ventas !== 0 ? (ebitda / ventas) * 100 : 0,
      amortizacion: y.amortizacion,
      ebit,
      resultadoFinanciero: y.resultado_financiero,
      resultadoAntesImpuestos: y.resultado_antes_impuestos,
      impuestoBeneficios: y.impuesto_beneficios,
      resultadoEjercicio,
      resultadoEjercicioPct: ventas !== 0 ? (resultadoEjercicio / ventas) * 100 : 0,
    };
  });
}
