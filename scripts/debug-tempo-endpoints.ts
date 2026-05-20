import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main(): Promise<void> {
  const ws = await prisma.jiraWorkspace.findFirst({ where: { tempoApiToken: { not: null } } });
  const token = ws!.tempoApiToken!;

  const endpoints = ["/4/users", "/4/members", "/4/accounts", "/4/teams/members", "/4/worklogs?limit=1"];
  for (const ep of endpoints) {
    const r = await fetch(`https://api.tempo.io${ep}`, { headers: { Authorization: `Bearer ${token}` } });
    console.log(ep, "->", r.status, r.status !== 200 ? await r.text() : "OK");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
