import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main(): Promise<void> {
  const ws = await prisma.jiraWorkspace.findFirst({ where: { tempoApiToken: { not: null } } });
  const token = ws!.tempoApiToken!;

  const r = await fetch("https://api.tempo.io/4/accounts?limit=50", { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const data = await r.json();
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
