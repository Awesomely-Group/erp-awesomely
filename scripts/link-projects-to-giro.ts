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
      _count: { select: { projects: { where: { active: true, giroProjectId: { not: null } } } } },
    },
  });

  let vinculados = 0;
  let sinEquivalente = 0;
  let yaOcupado = 0;
  let yaVinculados = 0;

  for (const workspace of workspaces) {
    console.log(`\n── ${workspace.name} ──`);
    yaVinculados += workspace._count.projects;

    if (!workspace.giroApiKey || !workspace.giroOrgSlug) {
      console.log("  Sin API key de Giro configurada — se salta.");
      console.log("  Créala en Giro: Configuración → API keys (solo ADMIN) y pégala en");
      console.log("  el ERP: Configuración → Workspaces Jira.");
      continue;
    }
    console.log(`  Ya vinculados: ${workspace._count.projects}. Pendientes: ${workspace.projects.length}.`);
    if (workspace.projects.length === 0) {
      console.log("  Nada que hacer.");
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

    console.log(`  ${giroProjects.length} proyectos visibles en Giro con esta clave: ${giroProjects.map((p) => p.key).join(", ") || "(ninguno)"}`);

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
      (yaOcupado > 0 ? ` · conflictos: ${yaOcupado}` : "") +
      ` · ya estaban vinculados: ${yaVinculados}`,
  );

  if (vinculados === 0 && yaVinculados > 0) {
    // El caso normal una vez hecho el trabajo: lo que queda sin vincular son los
    // proyectos administrativos de Jira (JIRA Admin, TEST, plantillas) que nunca han
    // tenido equivalente en Giro ni lo van a tener. Decirlo evita leer un "0" como un
    // fallo, que es justo lo que pasó la primera vez que se ejecutó esto.
    console.log("\nNada nuevo que vincular: los pendientes son proyectos de administración de Jira sin equivalente en Giro.");
  }

  if (vinculados === 0 && sinEquivalente > 0 && yaVinculados === 0) {
    // Un workspace del ERP guarda UNA sola clave de Giro, pero un sitio de Jira puede
    // alimentar varias organizaciones de Giro (el sitio de Gigson alimenta `gigson` y
    // `awesomely`, donde viven los proyectos con prefijo "AW -"). Si la clave es de una
    // sola, los proyectos de la otra no se ven desde aquí y salen todos como "sin
    // equivalente" sin que nada esté roto.
    console.log(
      "\nNinguno ha casado. Compara arriba las keys del ERP con las visibles en Giro:\n" +
        "  · si las de Giro son pocas y de otra familia, la clave es de una organización\n" +
        "    distinta a la que tiene esos proyectos (un sitio de Jira puede alimentar dos);\n" +
        "  · si la lista de Giro sale vacía, esa organización todavía no tiene proyectos.",
    );
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
