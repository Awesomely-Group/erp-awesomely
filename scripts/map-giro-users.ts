/**
 * Empareja las personas del ERP con los correos que usan en Giro.
 *
 * Hace falta porque las dos fuentes nombran a la misma persona de forma distinta: el ERP
 * indexa los roles de proyecto por `jiraAccountId` y Giro devuelve `authorEmail` en cada
 * parte. Sin el puente, toda hora que no esté en un issue asignado a mano a una bolsa se
 * queda sin repartir — medido el 2026-09-20: 224 h sueltas en Colvin.
 *
 * No se puede deducir solo: Giro no expone endpoint de usuarios y la API de Jira no da
 * correos. De ahí este listado emparejado, para confirmarlo a ojo una vez.
 *
 *   pnpm tsx scripts/map-giro-users.ts                    # lista y propone
 *   pnpm tsx scripts/map-giro-users.ts --json > m.json    # esqueleto para editar
 *   pnpm tsx scripts/map-giro-users.ts --apply m.json     # escribe giroUserEmail
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { GiroClient } from "../src/lib/giro-client";
import { JiraClient } from "../src/lib/jira";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

/** Giro da este correo a la gente importada de Jira que nunca se casó con un usuario real. */
const SHADOW = /^shadow\+([^@]+)@migrated\.giro\.internal$/i;

/**
 * Giro convierte el `accountId` a slug para poder meterlo en la parte local de un correo
 * (`shadowEmail` en `apps/giro/src/lib/import/identity.ts`), así que
 * "712020:91e6c357-…" se vuelve "712020-91e6c357-…". Hay que aplicar la misma
 * transformación antes de comparar: hacerlo con el id tal cual no casa nunca, y el
 * síntoma es una persona que sale "sin candidato" teniendo su correo sombra delante.
 */
function slugAccountId(accountId: string): string {
  return accountId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Sin acentos y en minúsculas, para poder comparar "Víctor Hellín" con "victor.hellin". */
function normaliza(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function tokens(s: string): string[] {
  return normaliza(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

interface Propuesta {
  jiraAccountId: string;
  jiraName: string;
  giroUserEmail: string | null;
  motivo: string;
}

async function main(): Promise<void> {
  const soloJson = process.argv.includes("--json");
  const applyIdx = process.argv.indexOf("--apply");

  /**
   * Con `--json` el listado va a stderr y solo el JSON a stdout, para que
   * `--json > mapa.json` deje un fichero parseable sin perder de vista la tabla.
   * Escribiendo las dos cosas a stdout el fichero sale roto — pasó al estrenarlo.
   */
  const log = (msg: string): void => {
    if (soloJson) process.stderr.write(`${msg}\n`);
    else console.log(msg);
  };

  if (applyIdx !== -1) {
    const file = process.argv[applyIdx + 1];
    if (!file) { console.error("Uso: --apply <fichero.json>"); process.exit(1); }
    const mapa = JSON.parse(readFileSync(file, "utf8")) as Propuesta[];
    let escritos = 0;
    for (const m of mapa) {
      if (m.giroUserEmail === null || m.giroUserEmail.trim() === "") continue;
      const r = await prisma.projectUserRole.updateMany({
        where: { jiraAccountId: m.jiraAccountId },
        data: { giroUserEmail: m.giroUserEmail.trim().toLowerCase() },
      });
      console.log(`  ${m.jiraName} → ${m.giroUserEmail} (${r.count} rol(es))`);
      escritos += r.count;
    }
    console.log(`\n${escritos} fila(s) de ProjectUserRole actualizadas.`);
    await prisma.$disconnect();
    return;
  }

  const baseUrl = process.env.GIRO_BASE_URL;
  if (!baseUrl) { console.error("Falta GIRO_BASE_URL."); process.exit(1); }

  const projects = await prisma.jiraProject.findMany({
    where: { active: true, giroProjectId: { not: null }, userRoles: { some: {} } },
    include: { workspace: true, userRoles: { include: { role: true } } },
    orderBy: { jiraKey: "asc" },
  });

  const hoy = new Date().toISOString().slice(0, 10);
  const propuestas = new Map<string, Propuesta>();

  for (const project of projects) {
    if (!project.workspace.giroApiKey) continue;

    // Horas por autor en Giro, de todo el histórico que pueda haber.
    const horasPorCorreo = new Map<string, number>();
    try {
      const worklogs = await new GiroClient(baseUrl, project.workspace.giroApiKey)
        .listWorklogs(project.giroProjectId!, "2020-01-01", hoy);
      for (const w of worklogs) {
        const email = w.authorEmail.toLowerCase();
        horasPorCorreo.set(email, (horasPorCorreo.get(email) ?? 0) + w.timeSpentSeconds / 3600);
      }
    } catch (error) {
      log(`\n${project.jiraKey}: no se pudo consultar Giro — ${error instanceof Error ? error.message : error}`);
      continue;
    }

    // Nombres de Jira. Si falla, se queda el accountId, que sigue sirviendo para emparejar.
    let nombres = new Map<string, string>();
    try {
      nombres = await new JiraClient(project.workspace.domain, project.workspace.email, project.workspace.apiToken)
        .getUsersByAccountIds(project.userRoles.map((r) => r.jiraAccountId));
    } catch { /* se sigue sin nombres */ }

    log(`\n── ${project.jiraKey} — ${project.name} ──`);
    log("  ERP (rol de proyecto):");
    for (const ur of project.userRoles) {
      const nombre = nombres.get(ur.jiraAccountId) ?? "(nombre no resuelto)";
      const ya = ur.giroUserEmail === null ? "" : `  → ya mapeado: ${ur.giroUserEmail}`;
      log(`    ${nombre.padEnd(24)} ${ur.role.name.padEnd(14)} ${ur.jiraAccountId}${ya}`);

      // Propuesta: el correo sombra lleva dentro el accountId, así que es exacto. Si no,
      // se compara el nombre de Jira con la parte local del correo.
      let propuesto: string | null = null;
      let motivo = "sin candidato — rellenar a mano";
      for (const [email] of horasPorCorreo) {
        const shadow = SHADOW.exec(email);
        if (shadow !== null && shadow[1] === slugAccountId(ur.jiraAccountId)) {
          propuesto = email; motivo = "correo sombra: contiene el accountId"; break;
        }
      }
      if (propuesto === null) {
        const nt = tokens(nombre);
        for (const [email] of horasPorCorreo) {
          if (SHADOW.test(email)) continue;
          const local = normaliza(email.split("@")[0]);
          if (nt.some((t) => local.includes(t))) {
            propuesto = email; motivo = `el nombre de Jira coincide con "${local}"`; break;
          }
        }
      }
      const previa = propuestas.get(ur.jiraAccountId);
      if (previa === undefined || (previa.giroUserEmail === null && propuesto !== null)) {
        propuestas.set(ur.jiraAccountId, { jiraAccountId: ur.jiraAccountId, jiraName: nombre, giroUserEmail: propuesto, motivo });
      }
    }

    log("  Giro (quién ha imputado en este proyecto):");
    const ordenados = [...horasPorCorreo].sort((a, b) => b[1] - a[1]);
    if (ordenados.length === 0) log("    (ningún parte)");
    for (const [email, horas] of ordenados) {
      log(`    ${email.padEnd(44)} ${horas.toFixed(2).padStart(8)} h${SHADOW.test(email) ? "  (importado, sin casar en Giro)" : ""}`);
    }
  }

  const lista = [...propuestas.values()];

  if (soloJson) {
    // A stdout limpio para poder redirigirlo a un fichero, editarlo y devolverlo con --apply.
    console.log(JSON.stringify(lista, null, 2));
    await prisma.$disconnect();
    return;
  }

  console.log("\n── Propuesta de emparejamiento ──");
  for (const p of lista) {
    const marca = p.giroUserEmail === null ? "✗" : "✓";
    console.log(`  ${marca} ${p.jiraName.padEnd(24)} → ${p.giroUserEmail ?? "?"}   (${p.motivo})`);
  }
  const sinCandidato = lista.filter((p) => p.giroUserEmail === null).length;
  console.log(
    `\n${lista.length - sinCandidato} de ${lista.length} con candidato.` +
      (sinCandidato > 0 ? ` ${sinCandidato} a rellenar a mano.` : "") +
      "\nRevísalo: son propuestas por parecido de nombre, no certezas.\n" +
      "  pnpm tsx scripts/map-giro-users.ts --json > mapa.json   (editar)\n" +
      "  pnpm tsx scripts/map-giro-users.ts --apply mapa.json",
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
