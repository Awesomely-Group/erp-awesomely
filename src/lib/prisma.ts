import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * El adapter se elige por el **host** de `DATABASE_URL`, no por `NODE_ENV`.
 *
 * Hasta ahora era siempre el de Neon, que habla por WebSocket y no sabe conectarse a un
 * Postgres normal. La consecuencia es la que de verdad dolía: **no había forma de
 * levantar el ERP contra una base local**, así que cualquier prueba de verdad tenía que
 * apuntar a la Neon de producción — la base financiera real de la empresa. Mismo
 * criterio que Giro, y por el mismo motivo: un `prisma migrate deploy` en CI contra Neon
 * tiene que usar el adapter bueno aunque no sea "production".
 */
function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL!;
  const adapter = isNeonUrl(connectionString)
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
