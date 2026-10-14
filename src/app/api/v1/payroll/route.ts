import type { ApiEmployee } from "@/contracts";
import { apiRoute, companyWhere, page, paged } from "@/lib/api/v1";
import { prisma } from "@/lib/prisma";

/**
 * Personas empleadas. Pide `payroll:read`, que exige ADMIN vivo.
 *
 * **El IBAN no sale de aquí**, aunque esté en la tabla: exponerlo multiplicaría las
 * copias de un dato bancario de una persona física sin que ningún consumidor lo
 * necesite. Quien lo necesite, a la pantalla. Por el mismo motivo este scope no se
 * expone nunca al MCP.
 */
export const GET = apiRoute(async (request, ctx) => {
  const url = new URL(request.url);
  const p = page(url);
  if (p instanceof Response) return p;

  const where = { ...companyWhere(ctx) };

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      select: { id: true, fullName: true, companyId: true, isExEmployee: true },
      orderBy: { fullName: "asc" },
      skip: p.offset,
      take: p.limit,
    }),
    prisma.employee.count({ where }),
  ]);

  const body: ApiEmployee[] = employees;
  return paged(body, total, p);
}, { scope: "payroll:read" });
