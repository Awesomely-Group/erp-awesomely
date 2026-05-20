// Uso: pnpm tsx scripts/debug-tempo-users.ts [from] [to]
// Ejemplo: pnpm tsx scripts/debug-tempo-users.ts 2024-01-01 2025-12-31
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main(): Promise<void> {
  const [, , argFrom, argTo] = process.argv;
  const from = argFrom ?? "2024-01-01";
  const to = argTo ?? new Date().toISOString().slice(0, 10);

  const ws = await prisma.jiraWorkspace.findFirst({ where: { tempoApiToken: { not: null } } });
  if (!ws?.tempoApiToken) throw new Error("No hay token de Tempo");

  console.log(`Buscando worklogs de ${from} a ${to}...`);

  // 1. Obtener todos los worklogs del rango
  const allAccountIds = new Set<string>();
  let offset = 0;
  while (true) {
    const url = `https://api.tempo.io/4/worklogs?from=${from}&to=${to}&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${ws.tempoApiToken}`, Accept: "application/json" } });
    if (!res.ok) throw new Error(`Tempo ${res.status}: ${await res.text()}`);
    const data = await res.json() as { results: Array<{ author: { accountId: string } }>; metadata: { next?: string } };
    for (const w of data.results) allAccountIds.add(w.author.accountId);
    if (!data.metadata.next || data.results.length < 1000) break;
    offset += 1000;
  }

  console.log(`AccountIds únicos encontrados en worklogs: ${allAccountIds.size}`);

  // 2. Resolver nombres en Jira
  const auth = `Basic ${Buffer.from(`${ws.email}:${ws.apiToken}`).toString("base64")}`;
  const results: Array<{ accountId: string; displayName: string; active: boolean | null }> = [];

  for (const accountId of allAccountIds) {
    try {
      const r = await fetch(`https://${ws.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/rest/api/3/user?accountId=${accountId}`, {
        headers: { Authorization: auth, Accept: "application/json" },
      });
      if (r.ok) {
        const u = await r.json() as { displayName: string; active: boolean };
        results.push({ accountId, displayName: u.displayName, active: u.active });
      } else {
        results.push({ accountId, displayName: "(no encontrado en Jira)", active: null });
      }
    } catch {
      results.push({ accountId, displayName: "(error)", active: null });
    }
  }

  results.sort((a, b) => a.displayName.localeCompare(b.displayName));

  console.log("\n--- USUARIOS QUE HAN LOGADO HORAS EN TEMPO ---\n");
  console.log(`${"NOMBRE".padEnd(35)} ${"ACTIVO".padEnd(8)} ACCOUNT ID`);
  console.log("-".repeat(80));
  for (const u of results) {
    const active = u.active === null ? "?" : u.active ? "sí" : "NO";
    console.log(`${u.displayName.padEnd(35)} ${active.padEnd(8)} ${u.accountId}`);
  }
  console.log(`\nTotal: ${results.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
