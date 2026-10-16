import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";

// El adaptador de Neon habla WebSocket, no el protocolo de Postgres: contra un Postgres
// plano (Docker, CI) no conecta. Para probar en local sin tocar producción se puede poner
// delante el proxy oficial de Neon (ghcr.io/neondatabase/wsproxy) y apuntar aquí:
//   NEON_LOCAL_WS_PROXY=localhost:54330
// Solo afecta a desarrollo; en Vercel la variable no existe y el driver va directo a Neon.
const localWsProxy = process.env.NEON_LOCAL_WS_PROXY;
if (localWsProxy) {
  neonConfig.wsProxy = () => `${localWsProxy}/v1`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
}

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
