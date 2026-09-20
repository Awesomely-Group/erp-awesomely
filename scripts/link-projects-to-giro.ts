/**
 * Vincula en bloque los proyectos del ERP con sus equivalentes en Giro, casando por
 * *key* (la "FIN" de "FIN-73"), que es la misma a ambos lados: el importador de Giro
 * mantiene paridad con Jira a propósito.
 *
 * Existe porque hacerlo a mano, proyecto a proyecto, con el formulario de la ficha, es
 * lo que ha tenido parado el portal de cliente: sin `giroProjectId` no llega ni una hora
 * de Giro y todo cae a Tempo.
 *
 *   pnpm tsx scripts/link-projects-to-giro.ts            # solo enseña lo que haría
 *   pnpm tsx scripts/link-projects-to-giro.ts --apply    # escribe
 *
 * Requiere `GIRO_BASE_URL` y, por workspace, `JiraWorkspace.giroApiKey` + `giroOrgSlug`.
 * La API key de Giro **es** la frontera de organización: una de `gigson` no ve nada de
 * `latroupe`, así que cada workspace se resuelve contra la suya.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { GiroClient } from "../src/lib/giro-client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  console.log(APPLY ? "MODO ESCRITURA (--apply)\n" : "SIMULACRO — nada se escribe. Añade --apply para aplicar.\n");

  const baseUrl = process.env.GIRO_BASE_URL;
  if (!baseUrl) {
    console.error("Falta GIRO_BASE_URL.");
    process.exit(1);
  }

  const workspaces = await prisma.jiraWorkspace.findMany({
    where: { active: true },
    include: {
      projects: {
        where: { active: true, giroProjectId: null },
        select: { id: true, jiraKey: true, name: true },
        orderBy: { jiraKey: "asc" },
      },
    },
  });

  let vinculados = 0;
  let sinEquivalente = 0;
  let yaOcupado = 0;

  for (const workspace of workspaces) {
    console.log(`\n── ${workspace.name} ──`);

    if (!workspace.giroApiKey || !workspace.giroOrgSlug) {
      console.log("  Sin API key de Giro configurada — se salta.");
      console.log("  Créala en Giro: Configuración → API keys (solo ADMIN) y pégala en");
      console.log("  el ERP: Configuración → Workspaces Jira.");
      continue;
    }
    if (workspace.projects.length === 0) {
      console.log("  No hay proyectos activos pendientes de vincular.");
      continue;
    }

    let giroProjects;
    try {
      giroProjects = await new GiroClient(baseUrl, workspace.giroApiKey).listProjects();
    } catch (error) {
      console.error(`  No se pudo consultar Giro: ${error instanceof Error ? error.message : error}`);
      continue;
    }

    // Una key por proyecto y sin distinguir mayúsculas, igual que el formulario manual.
    const byKey = new Map(giroProjects.map((p) => [p.key.toUpperCase(), p]));

    for (const project of workspace.projects) {
      const match = byKey.get(project.jiraKey.toUpperCase());
      if (match === undefined) {
        console.log(`  ✗ ${project.jiraKey} — ${project.name}: sin equivalente en Giro`);
        sinEquivalente += 1;
        continue;
      }

      if (APPLY) {
        try {
          await prisma.jiraProject.update({
            where: { id: project.id },
            data: { giroProjectId: match.id },
          });
        } catch {
          // `giroProjectId` es único: si falla, ese proyecto de Giro ya está vinculado a
          // otro del ERP. Se avisa en vez de tragárselo, porque significa que hay dos
          // proyectos del ERP compitiendo por las mismas horas.
          console.log(`  ! ${project.jiraKey} — ${project.name}: "${match.key}" ya está vinculado a otro proyecto`);
          yaOcupado += 1;
          continue;
        }
      }
      console.log(`  ✓ ${project.jiraKey} — ${project.name} → ${match.key}${match.isInternal ? " (interno)" : ""}`);
      vinculados += 1;
    }
  }

  console.log(
    `\n${APPLY ? "Vinculados" : "Se vincularían"}: ${vinculados} · sin equivalente: ${sinEquivalente}` +
      (yaOcupado > 0 ? ` · conflictos: ${yaOcupado}` : ""),
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
