/**
 * Rellena el puente `GiroUserLink` preguntándole a Giro quién es quién (Bloque E).
 *
 *   pnpm tsx scripts/sync-giro-user-links.ts            # dry-run
 *   pnpm tsx scripts/sync-giro-user-links.ts --apply
 *
 * Giro ya sabe la correspondencia `accountId → persona`: la viene guardando el motor de
 * sync desde F8 en `MigrationMap`, incluidas las cuentas fusionadas a mano y las
 * identidades confirmadas una a una. Lo que faltaba era poder preguntárselo, y eso es
 * `GET /api/v1/users`. Esto solo copia esa respuesta a una tabla local para no tener que
 * ir a la red en cada consulta de horas.
 *
 * Lo que **no** resuelve se lista al final en vez de inventarse nada: son los
 * `accountId` que el ERP conoce (de `SupplierJiraUser` y `ProjectUserRole`) y que Giro
 * no tiene mapeados — gente que nunca imputó en Jira, o altas nativas de Giro. Esos se
 * casan a mano con `scripts/map-giro-users.ts`, que ya existía para eso.
 *
 * Un `accountId` sin puente no da ningún error visible: sus horas caen en "sin atribuir"
 * y su coste se subestima en silencio. Por eso la lista del final no es informativa, es
 * el trabajo que queda.
 */
import { prisma } from "../src/lib/prisma";
import { GiroClient } from "../src/lib/giro-client";

const apply = process.argv.includes("--apply");

async function main(): Promise<void> {
  const baseUrl = process.env.GIRO_BASE_URL;
  if (!baseUrl) throw new Error("Falta GIRO_BASE_URL");

  const workspaces = await prisma.jiraWorkspace.findMany({
    where: { giroApiKey: { not: null } },
    select: { id: true, name: true, giroApiKey: true, giroOrgSlug: true },
  });
  if (workspaces.length === 0) {
    console.log("Ningún workspace tiene clave de Giro configurada. Nada que hacer.");
    return;
  }

  console.log(apply ? "⚠ APLICANDO cambios" : "Dry-run (añade --apply para escribir)");

  const vistos = new Set<string>();
  let nuevos = 0;
  let actualizados = 0;

  for (const workspace of workspaces) {
    const client = new GiroClient(baseUrl, workspace.giroApiKey!);
    const usuarios = await client.listUsers();
    console.log(`\n${workspace.name} (${workspace.giroOrgSlug ?? "?"}): ${usuarios.length} personas`);

    for (const usuario of usuarios) {
      for (const accountId of usuario.accountIds) {
        vistos.add(accountId);

        const existente = await prisma.giroUserLink.findUnique({ where: { jiraAccountId: accountId } });
        if (existente && existente.giroUserId === usuario.id && existente.isShadow === usuario.isShadow) {
          continue;
        }

        // Un enlace puesto a mano no se pisa: alguien lo revisó y Giro puede seguir sin
        // tener ese accountId mapeado.
        if (existente?.source === "MANUAL") {
          console.log(`  = ${accountId} ya casado a mano con ${existente.giroUserEmail}, se respeta`);
          continue;
        }

        console.log(
          `  ${existente ? "~" : "+"} ${accountId} → ${usuario.email}${usuario.isShadow ? " (shadow)" : ""}`,
        );
        if (existente) actualizados += 1;
        else nuevos += 1;

        if (apply) {
          await prisma.giroUserLink.upsert({
            where: { jiraAccountId: accountId },
            create: {
              jiraAccountId: accountId,
              giroUserId: usuario.id,
              giroUserEmail: usuario.email,
              isShadow: usuario.isShadow,
              source: "API",
            },
            update: { giroUserId: usuario.id, giroUserEmail: usuario.email, isShadow: usuario.isShadow },
          });
        }
      }
    }
  }

  // Lo que el ERP conoce y Giro no ha podido mapear.
  const [deProveedores, deProyectos] = await Promise.all([
    prisma.supplierJiraUser.findMany({ select: { accountId: true } }),
    prisma.projectUserRole.findMany({ select: { jiraAccountId: true } }),
  ]);
  const conocidos = new Set([
    ...deProveedores.map((fila) => fila.accountId),
    ...deProyectos.map((fila) => fila.jiraAccountId),
  ]);
  const sinPuente = [...conocidos].filter((accountId) => !vistos.has(accountId));

  console.log(`\n${nuevos} enlaces nuevos, ${actualizados} actualizados.`);
  if (sinPuente.length > 0) {
    console.log(
      `\n⚠ ${sinPuente.length} accountId que el ERP usa y Giro no tiene mapeados.\n` +
        "  Sus horas caerían en 'sin atribuir' sin dar ningún error. Cásalos a mano con\n" +
        "  scripts/map-giro-users.ts antes del cutover:",
    );
    for (const accountId of sinPuente) console.log(`    ${accountId}`);
  } else {
    console.log("\n✓ Todos los accountId que usa el ERP tienen puente.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
