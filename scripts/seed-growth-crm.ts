// Seed inicial del módulo Growth/CRM (plan revisado 2026-09-18):
//   - CrmStage: mismo funnel de 7 etapas para las 4 marcas de MARCA_OPTIONS. Es una
//     PROPUESTA razonable, no viene de ningún documento verificado en la sesión que
//     diseñó este módulo (la estrategia de Confluence §7.1 puede tener el funnel real) —
//     confirmar con el usuario y ajustar aquí si hace falta (idempotente, solo hay que
//     re-ejecutar `tsx scripts/seed-growth-crm.ts`).
//   - CommissionRule: solo LaTroupe activa (D9), 10% + 20€ configurables desde
//     /crm/comisiones por un admin.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MARCAS = ["Gigson Solutions", "Gigson", "Awesomely", "LaTroupe"] as const;

const STAGES = [
  { name: "Nuevo", order: 1 },
  { name: "Contactado", order: 2 },
  { name: "Reunión agendada", order: 3 },
  { name: "Cualificado", order: 4 },
  { name: "Propuesta enviada", order: 5 },
  { name: "Ganado", order: 6, isWon: true },
  { name: "Perdido", order: 7, isLost: true },
] as const;

async function main(): Promise<void> {
  console.log("Seeding CrmStage…");
  for (const marca of MARCAS) {
    for (const stage of STAGES) {
      await prisma.crmStage.upsert({
        where: { marca_order: { marca, order: stage.order } },
        update: {
          name: stage.name,
          isWon: "isWon" in stage ? stage.isWon : false,
          isLost: "isLost" in stage ? stage.isLost : false,
        },
        create: {
          marca,
          name: stage.name,
          order: stage.order,
          isWon: "isWon" in stage ? stage.isWon : false,
          isLost: "isLost" in stage ? stage.isLost : false,
        },
      });
    }
  }

  console.log("Seeding CommissionRule (solo LaTroupe activa, D9)…");
  await prisma.commissionRule.upsert({
    where: { marca: "LaTroupe" },
    update: {},
    create: { marca: "LaTroupe", proposalPercent: 10, qualifiedMeetingAmount: 20, active: true },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
