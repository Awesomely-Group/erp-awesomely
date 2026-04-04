import type { Empresa, Marca } from "@prisma/client";
import type { Prisma } from "@prisma/client";

/** Empresa jurídica (filtros / asignación por cuenta Holded). */
export const EMPRESA_OPTIONS: { value: Empresa; label: string }[] = [
  { value: "AWESOMELY_SL", label: "Awesomely SL" },
  { value: "AWESOMELY_OU", label: "Awesomely OU" },
];

/** Marca comercial del grupo. */
export const MARCA_OPTIONS: { value: Marca; label: string }[] = [
  { value: "GIGSON_SOLUTIONS", label: "Gigson Solutions" },
  { value: "GIGSON", label: "Gigson" },
  { value: "AWESOMELY", label: "Awesomely" },
  { value: "LATROUPE", label: "LaTroupe" },
];

export function parseEmpresaParam(v: string | undefined): Empresa | undefined {
  if (v === "AWESOMELY_SL" || v === "AWESOMELY_OU") return v;
  return undefined;
}

export function parseMarcaParam(v: string | undefined): Marca | undefined {
  if (
    v === "GIGSON_SOLUTIONS" ||
    v === "GIGSON" ||
    v === "AWESOMELY" ||
    v === "LATROUPE"
  ) {
    return v;
  }
  return undefined;
}

/** Filtro por relación company (facturas / agregados). */
export function invoiceWhereCompanyOrg(
  empresa?: Empresa,
  marca?: Marca
): { company: Prisma.CompanyWhereInput } | undefined {
  if (!empresa && !marca) return undefined;
  const company: Prisma.CompanyWhereInput = {};
  if (empresa) company.empresa = empresa;
  if (marca) company.marca = marca;
  return { company };
}
