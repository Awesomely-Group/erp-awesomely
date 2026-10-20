/**
 * Compara las horas que da Giro con las que da Tempo, proyecto a proyecto y mes a mes.
 *
 *   pnpm tsx scripts/compare-hours-giro-vs-tempo.ts --desde 2026-01 --hasta 2026-10
 *
 * **Solo lee.** Está pensado para correr a diario durante el dual-run y contestar la
 * única pregunta que decide el cutover: ¿cuadran? Mirarlo a ojo en una pantalla no
 * sirve — las diferencias que importan son de minutos sobre miles de horas.
 *
 * Siete filas tienen que dar **cero** para poder apagar Tempo. Dos más se espera que
 * difieran, y son justamente las que hay que enseñar antes de flipar:
 *
 * - `billable`: Tempo no lo distingue por línea, así que desde ahí todo entra como
 *   facturable. Al pasar a Giro, las no facturables salen del consumo de bolsa.
 * - `approved`: lo mismo con la aprobación. Las horas aún sin aprobar dejan de contar
 *   como consumidas y pasan a "pendiente de aprobación".
 *
 * La consecuencia de las dos juntas es que **el saldo que ve el cliente sube** el día
 * del flip. Eso no es un fallo, pero sí algo que se cuenta antes y no después.
 */
import { GiroClient } from "../src/lib/giro-client";
import { prisma } from "../src/lib/prisma";
import { TempoClient } from "../src/lib/tempo";
import { resolvePersonKeys } from "../src/lib/hours-source";

type Fila = {
  proyecto: string;
  mes: string;
  horasGiro: number;
  horasTempo: number;
  lineasGiro: number;
  lineasTempo: number;
  autoresSinResolver: number;
  horasNoFacturables: number;
  horasSinAprobar: number;
};

function argumento(nombre: string, porDefecto: string): string {
  const indice = process.argv.indexOf(`--${nombre}`);
  return indice >= 0 ? (process.argv[indice + 1] ?? porDefecto) : porDefecto;
}

/** Los meses `YYYY-MM` entre dos extremos, ambos incluidos. */
function meses(desde: string, hasta: string): string[] {
  const salida: string[] = [];
  const [y1, m1] = desde.split("-").map(Number);
  const [y2, m2] = hasta.split("-").map(Number);
  for (let y = y1!, m = m1!; y < y2! || (y === y2! && m <= m2!); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
    salida.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return salida;
}

function rangoDelMes(mes: string): { from: string; to: string } {
  const [y, m] = mes.split("-").map(Number);
  const fin = new Date(Date.UTC(y!, m!, 0));
  return { from: `${mes}-01`, to: fin.toISOString().slice(0, 10) };
}

const redondea = (n: number): number => Math.round(n * 100) / 100;
/** Dos horas cuadran si difieren en menos de medio minuto: el redondeo no es un fallo. */
const cuadra = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

async function main(): Promise<void> {
  const baseUrl = process.env.GIRO_BASE_URL;
  if (!baseUrl) throw new Error("Falta GIRO_BASE_URL");

  const desde = argumento("desde", new Date().toISOString().slice(0, 7));
  const hasta = argumento("hasta", new Date().toISOString().slice(0, 7));

  const proyectos = await prisma.jiraProject.findMany({
    where: { active: true, giroProjectId: { not: null } },
    include: { workspace: true },
    orderBy: { name: "asc" },
  });

  console.log(`Comparando ${proyectos.length} proyecto(s) vinculado(s), de ${desde} a ${hasta}\n`);

  const filas: Fila[] = [];

  for (const proyecto of proyectos) {
    if (!proyecto.workspace.giroApiKey || !proyecto.workspace.tempoApiToken) {
      console.log(`· ${proyecto.name}: sin una de las dos credenciales, no se puede comparar`);
      continue;
    }

    const giro = new GiroClient(baseUrl, proyecto.workspace.giroApiKey);
    const tempo = new TempoClient(proyecto.workspace.tempoApiToken);

    for (const mes of meses(desde, hasta)) {
      const { from, to } = rangoDelMes(mes);

      const [deGiro, deTempo] = await Promise.all([
        giro.listWorklogs(proyecto.giroProjectId!, from, to),
        tempo.getWorklogs(proyecto.jiraId, from, to),
      ]);

      // Los autores de Tempo tienen que poder resolverse a persona de Giro, o sus horas
      // acabarán sin atribuir cuando esto sea la única fuente.
      const puente = await resolvePersonKeys(deTempo.map((w) => w.author.accountId));
      const sinResolver = new Set(
        deTempo.filter((w) => !puente.has(w.author.accountId)).map((w) => w.author.accountId),
      );

      const horasGiro = deGiro.reduce((total, w) => total + w.timeSpentSeconds / 3600, 0);
      const horasTempo = deTempo.reduce((total, w) => total + w.timeSpentSeconds / 3600, 0);

      filas.push({
        proyecto: proyecto.jiraKey,
        mes,
        horasGiro: redondea(horasGiro),
        horasTempo: redondea(horasTempo),
        lineasGiro: deGiro.length,
        lineasTempo: deTempo.length,
        autoresSinResolver: sinResolver.size,
        horasNoFacturables: redondea(
          deGiro.filter((w) => !w.billable).reduce((total, w) => total + w.timeSpentSeconds / 3600, 0),
        ),
        horasSinAprobar: redondea(
          deGiro
            .filter((w) => w.timesheetStatus !== "APPROVED")
            .reduce((total, w) => total + w.timeSpentSeconds / 3600, 0),
        ),
      });
    }
  }

  // ─── Lo que tiene que dar cero ───────────────────────────────────────────────
  const descuadres = filas.filter(
    (fila) =>
      !cuadra(fila.horasGiro, fila.horasTempo) ||
      fila.lineasGiro !== fila.lineasTempo ||
      fila.autoresSinResolver > 0,
  );

  if (descuadres.length === 0) {
    console.log("✓ Horas, número de líneas y resolución de autores cuadran en todo el periodo.\n");
  } else {
    console.log(`✗ ${descuadres.length} descuadre(s). NO se puede apagar Tempo todavía:\n`);
    for (const fila of descuadres) {
      const motivos = [
        !cuadra(fila.horasGiro, fila.horasTempo)
          ? `horas ${fila.horasGiro} vs ${fila.horasTempo} (Δ ${redondea(fila.horasGiro - fila.horasTempo)})`
          : null,
        fila.lineasGiro !== fila.lineasTempo ? `líneas ${fila.lineasGiro} vs ${fila.lineasTempo}` : null,
        fila.autoresSinResolver > 0 ? `${fila.autoresSinResolver} autor(es) sin puente` : null,
      ].filter(Boolean);
      console.log(`  ${fila.proyecto} ${fila.mes}: ${motivos.join(" · ")}`);
    }
    console.log("");
  }

  // ─── Lo que se espera que cambie, y hay que enseñar antes ────────────────────
  const conDelta = filas.filter((fila) => fila.horasNoFacturables > 0 || fila.horasSinAprobar > 0);
  if (conDelta.length > 0) {
    console.log("Diferencias ESPERADAS al pasar a Giro (esto es lo que hay que enseñar antes de flipar):");
    console.log("  Tempo contaba todo como facturable y aprobado; Giro no.\n");
    for (const fila of conDelta) {
      console.log(
        `  ${fila.proyecto} ${fila.mes}: ${fila.horasNoFacturables}h no facturables, ` +
          `${fila.horasSinAprobar}h aún sin aprobar (de ${fila.horasGiro}h)`,
      );
    }
  }

  process.exitCode = descuadres.length === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
