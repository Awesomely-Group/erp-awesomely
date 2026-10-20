import type { ApiSupplier } from "@/contracts";
import { apiRoute, companyWhere, page, paged } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";

/** Proveedores y su tarifa. Acotado a las sociedades que la credencial alcanza. */
export const GET = apiRoute(async (request, ctx) => {
  const url = new URL(request.url);
  const p = page(url);
  if (p instanceof Response) return p;

  const where = { ...companyWhere(ctx) };

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      select: {
        id: true,
        name: true,
        isPartner: true,
        tipo: true,
        hourlyRate: true,
        companyId: true,
        defaultRole: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      skip: p.offset,
      take: p.limit,
    }),
    prisma.supplier.count({ where }),
  ]);

  const body: ApiSupplier[] = suppliers.map((supplier) => ({
    id: supplier.id,
    name: supplier.name,
    isPartner: supplier.isPartner,
    tipo: supplier.tipo,
    hourlyRate: supplier.hourlyRate === null ? null : Number(supplier.hourlyRate),
    defaultRoleName: supplier.defaultRole?.name ?? null,
    companyId: supplier.companyId,
  }));

  return paged(body, total, p);
}, { scope: "suppliers:read" });
