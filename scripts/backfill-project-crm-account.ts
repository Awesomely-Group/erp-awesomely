/**
 * Propone qué cuenta de cliente (`CrmAccount`) corresponde a cada proyecto, cruzando
 * por las proformas ya clasificadas a ese proyecto.
 *
 * Es solo una heurística de arranque, no el mecanismo: `Proforma.projectId` lo rellena
 * una persona a mano, así que **nunca se asigna un caso ambiguo**. Lo que no salga
 * limpio se lista para decidirlo a mano en la ficha del proyecto, que es donde vive el
 * selector definitivo.
 *
 *   pnpm tsx scripts/backfill-project-crm-account.ts            # solo enseña lo que haría
 *   pnpm tsx scripts/backfill-project-crm-account.ts --apply    # escribe
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  console.log(APPLY ? "MODO ESCRITURA (--apply)\n" : "SIMULACRO — nada se escribe. Añade --apply para aplicar.\n");

  // Solo los que importan para el portal: los que tienen bolsas y todavía no tienen cliente.
  const projects = await prisma.jiraProject.findMany({
    where: { crmAccountId: null, active: true, hourBuckets: { some: {} } },
    select: { id: true, name: true, jiraKey: true },
    orderBy: { name: "asc" },
  });

  console.log(`Proyectos con bolsas y sin cliente: ${projects.length}\n`);

  const resueltos: string[] = [];
  const ambiguos: string[] = [];
  const sinPistas: string[] = [];

  for (const project of projects) {
    const proformas = await prisma.proforma.findMany({
      where: { projectId: project.id, holdedContactId: { not: null } },
      select: { companyId: true, holdedContactId: true },
      distinct: ["companyId", "holdedContactId"],
    });

    if (proformas.length === 0) {
      sinPistas.push(`  ${project.jiraKey} — ${project.name}: sin proformas clasificadas`);
      continue;
    }

    const accounts = await prisma.crmAccount.findMany({
      where: {
        OR: proformas.map((p) => ({
          companyId: p.companyId,
          holdedContactId: p.holdedContactId,
        })),
      },
      select: { id: true, name: true },
    });

    const unicas = [...new Map(accounts.map((a) => [a.id, a])).values()];

    if (unicas.length === 1) {
      resueltos.push(`  ${project.jiraKey} — ${project.name} → ${unicas[0].name}`);
      if (APPLY) {
        await prisma.jiraProject.update({
          where: { id: project.id },
          data: { crmAccountId: unicas[0].id },
        });
      }
    } else if (unicas.length > 1) {
      // Dos clientes distintos en las proformas del mismo proyecto. Elegir uno sería
      // decidir a ciegas de quién son las horas: eso se mira a mano.
      ambiguos.push(`  ${project.jiraKey} — ${project.name}: ${unicas.map((a) => a.name).join(" | ")}`);
    } else {
      sinPistas.push(`  ${project.jiraKey} — ${project.name}: proformas sin cuenta de CRM equivalente`);
    }
  }

  console.log(`RESUELTOS (${resueltos.length})`);
  resueltos.forEach((l) => console.log(l));
  console.log(`\nAMBIGUOS — decidir a mano (${ambiguos.length})`);
  ambiguos.forEach((l) => console.log(l));
  console.log(`\nSIN PISTAS — decidir a mano (${sinPistas.length})`);
  sinPistas.forEach((l) => console.log(l));

  console.log(
    APPLY
      ? `\nAplicados ${resueltos.length}. Los ${ambiguos.length + sinPistas.length} restantes se asignan en la ficha del proyecto.`
      : `\nSimulacro. Se habrían aplicado ${resueltos.length}.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
