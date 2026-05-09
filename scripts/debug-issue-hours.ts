// Uso: pnpm tsx scripts/debug-issue-hours.ts [projectId] [from] [to]
// Ejemplo: pnpm tsx scripts/debug-issue-hours.ts "" "2025-01-01" "2025-01-31"
// Si no se pasa projectId usa el primero con token Tempo.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const [, , argProjectId, argFrom, argTo] = process.argv;

  // ── 1. Buscar proyecto ──────────────────────────────────────────────────────
  const project = argProjectId
    ? await prisma.jiraProject.findUnique({
        where: { id: argProjectId },
        include: { workspace: true },
      })
    : await prisma.jiraProject.findFirst({
        where: { active: true, workspace: { tempoApiToken: { not: null } } },
        include: { workspace: true },
      });

  if (!project) {
    console.error("No se encontró ningún proyecto con token Tempo.");
    process.exit(1);
  }

  console.log("──────────────────────────────────────────────────");
  console.log(`Proyecto: ${project.name} (${project.jiraKey})`);
  console.log(`  id:       ${project.id}`);
  console.log(`  jiraId:   ${project.jiraId}`);
  console.log(`  workspace: ${project.workspace.name} (${project.workspace.domain})`);
  console.log(`  tempoToken: ${project.workspace.tempoApiToken ? "✓ configurado" : "✗ AUSENTE"}`);

  if (!project.workspace.tempoApiToken) process.exit(1);

  // ── 2. Rango de fechas ──────────────────────────────────────────────────────
  const now = new Date();
  const from = argFrom ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const to = argTo ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;
  console.log(`\nPeŕiodo: ${from} → ${to}`);

  // ── 3. Tempo worklogs ───────────────────────────────────────────────────────
  console.log("\n── STEP 1: Tempo worklogs ──────────────────────");
  const tempoUrl = new URL("https://api.tempo.io/4/worklogs");
  tempoUrl.searchParams.set("projectId", project.jiraId);
  tempoUrl.searchParams.set("from", from);
  tempoUrl.searchParams.set("to", to);
  tempoUrl.searchParams.set("limit", "50");

  const tempoRes = await fetch(tempoUrl.toString(), {
    headers: { Authorization: `Bearer ${project.workspace.tempoApiToken}`, Accept: "application/json" },
  });
  const tempoText = await tempoRes.text();

  if (!tempoRes.ok) {
    console.error("  ERROR Tempo:", tempoRes.status, tempoText);
    process.exit(1);
  }

  const tempoData = JSON.parse(tempoText) as {
    metadata: { count: number };
    results: Array<{ issue: unknown; author: unknown; timeSpentSeconds: number; startDate: string }>;
  };

  console.log(`  Total worklogs: ${tempoData.metadata.count}`);
  console.log(`  Muestra (primeros 3):`);
  for (const w of tempoData.results.slice(0, 3)) {
    console.log("   ", JSON.stringify(w));
  }

  // ── 4. Agregar por issue.id (numérico) — Tempo v4 no devuelve issue.key ────
  console.log("\n── STEP 2: Agregación por issue.id (numérico) ──");
  const secondsById = new Map<number, number>();
  let skippedNoId = 0;

  for (const w of tempoData.results) {
    const issue = w.issue as Record<string, unknown> | null | undefined;
    const id = issue?.id as number | undefined;
    if (id == null) { skippedNoId++; continue; }
    secondsById.set(id, (secondsById.get(id) ?? 0) + w.timeSpentSeconds);
  }

  console.log(`  Issues con horas: ${secondsById.size}`);
  console.log(`  Worklogs sin issue.id: ${skippedNoId}`);
  console.log(`  IDs (primeros 10): ${[...secondsById.keys()].slice(0, 10).join(", ")}`);

  if (secondsById.size === 0) {
    console.log("\n  ⚠️  Sin issues — no se llamará a Jira.");
    process.exit(0);
  }

  // ── 5. Jira issues por ID numérico ──────────────────────────────────────────
  console.log("\n── STEP 3: Jira /search/jql por id numérico ───");
  const issueIds = [...secondsById.keys()].slice(0, 10);
  const jql = `id IN (${issueIds.join(",")})`;
  console.log(`  JQL: ${jql}`);

  const jiraUrl = new URL(`https://${project.workspace.domain.replace(/^https?:\/\//, "")}/rest/api/3/search/jql`);
  jiraUrl.searchParams.set("jql", jql);
  jiraUrl.searchParams.set("fields", "summary,assignee,timeoriginalestimate");
  jiraUrl.searchParams.set("maxResults", "10");

  const authHeader = `Basic ${Buffer.from(`${project.workspace.email}:${project.workspace.apiToken}`).toString("base64")}`;
  const jiraRes = await fetch(jiraUrl.toString(), {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });
  const jiraText = await jiraRes.text();

  if (!jiraRes.ok) {
    console.error("  ERROR Jira:", jiraRes.status, jiraText.slice(0, 300));
    process.exit(1);
  }

  const jiraData = JSON.parse(jiraText) as {
    total: number;
    issues: Array<{ key: string; fields: Record<string, unknown> }>;
  };

  console.log(`  Issues devueltos por Jira: ${jiraData.total}`);
  for (const i of jiraData.issues.slice(0, 5)) {
    console.log(`   ${i.key}: summary="${i.fields.summary}", assignee=${JSON.stringify(i.fields.assignee)}, estimate=${i.fields.timeoriginalestimate}`);
  }

  console.log("\n── FIN ─────────────────────────────────────────");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
