import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { neonConfig } from "@neondatabase/serverless";

/**
 * Cómo se conecta el ERP a su base, según dónde esté corriendo.
 *
 * El problema de fondo, que dolió durante mucho tiempo: el adapter de Neon habla por
 * **WebSocket**, no el protocolo de Postgres, así que contra un Postgres plano (Docker,
 * CI) no conecta. Mientras fue el único adapter, no había forma de levantar el ERP
 * contra una base local y cualquier prueba de verdad tenía que apuntar a la Neon de
 * producción — la base financiera real de la empresa.
 *
 * Hay **dos** formas de arreglarlo y aquí conviven a propósito, porque sirven para
 * cosas distintas:
 *
 * 1. **`adapter-pg` cuando la URL no es de Neon.** Es el camino barato: basta
 *    `docker compose up postgres`. Mismo criterio que Giro. El coste es que en local se
 *    usa un driver distinto del de producción, así que un fallo propio del driver de
 *    Neon no aparecería.
 * 2. **El proxy oficial de Neon** (`ghcr.io/neondatabase/wsproxy`) delante del Postgres
 *    local, apuntado con `NEON_LOCAL_WS_PROXY=localhost:54330`. Cuesta un contenedor
 *    más, y a cambio en local se habla por el **mismo** driver que en producción. Es lo
 *    que hay que usar para reproducir algo que solo pasa contra Neon.
 *
 * Por eso el proxy **manda sobre el host**: si está configurado, la URL apunta a un
 * Postgres local y la regla 1, por sí sola, elegiría `adapter-pg` y lo dejaría sin
 * efecto. En Vercel la variable no existe y el driver va directo a Neon.
 */
const localWsProxy = process.env.NEON_LOCAL_WS_PROXY;
if (localWsProxy) {
  neonConfig.wsProxy = () => `${localWsProxy}/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

/**
 * La elección es por el **host** de `DATABASE_URL`, no por `NODE_ENV`: un
 * `prisma migrate deploy` en CI corre contra Neon sin ser "production" y tiene que usar
 * el adapter bueno.
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
  const usaNeon = !!localWsProxy || isNeonUrl(connectionString);
  const adapter = usaNeon
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
