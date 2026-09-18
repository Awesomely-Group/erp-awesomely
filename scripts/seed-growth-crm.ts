// Seed inicial del módulo Growth/CRM (plan revisado 2026-09-18, con el ajuste de
// lineOfBusiness por el impacto del plan de activación de Odoo):
//   - CrmStage: un funnel "GENERAL" de 7 etapas por marca. Es una PROPUESTA razonable,
//     no viene de ningún documento verificado en la sesión que diseñó este módulo (la
//     estrategia de Confluence §7.1 puede tener el funnel real) — confirmar con el
//     usuario y ajustar aquí si hace falta (idempotente, solo hay que re-ejecutar
//     `tsx scripts/seed-growth-crm.ts`).
//   - lineOfBusiness permite que una marca tenga más de un funnel (p.ej. Gigson
//     Solutions con "INTEGRACIONES" vs "ODOO", esta última con etapa "Demo"). NO se
//     siembra ningún funnel de Odoo todavía — las cifras del plan de activación
//     (88/44/22/9, 75 usuarios, ratio 3x) son una plantilla sin aprobar, no objetivos
//     confirmados. Cuando estén confirmados, añadir una entrada a FUNNELS con
//     lineOfBusiness: "ODOO" siguiendo el ejemplo comentado más abajo.
//   - CommissionRule: solo LaTroupe activa (D9), 10% + 20€ configurables desde
//     /crm/comisiones por un admin.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const MARCAS = ["Gigson Solutions", "Gigson", "Awesomely", "LaTroupe"] as const;

type StageSeed = { name: string; order: number; isWon?: boolean; isLost?: boolean };

const GENERAL_STAGES: StageSeed[] = [
  { name: "Nuevo", order: 1 },
  { name: "Contactado", order: 2 },
  { name: "Reunión agendada", order: 3 },
  { name: "Cualificado", order: 4 },
  { name: "Propuesta enviada", order: 5 },
  { name: "Ganado", order: 6, isWon: true },
  { name: "Perdido", order: 7, isLost: true },
];

const FUNNELS: { marca: string; lineOfBusiness: string; stages: StageSeed[] }[] = MARCAS.map(
  (marca) => ({ marca, lineOfBusiness: "GENERAL", stages: GENERAL_STAGES })
);

// Ejemplo para activar el funnel de Odoo cuando el plan de activación esté aprobado
// (deck: Leads/Calificación → Demo → Propuestas → Nuevos proyectos):
//
// FUNNELS.push({
//   marca: "Gigson Solutions",
//   lineOfBusiness: "ODOO",
//   stages: [
//     { name: "Nuevo", order: 1 },
//     { name: "Calificación", order: 2 },
//     { name: "Demo", order: 3 },
//     { name: "Propuesta enviada", order: 4 },
//     { name: "Ganado", order: 5, isWon: true },
//     { name: "Perdido", order: 6, isLost: true },
//   ],
// });

async function main(): Promise<void> {
  console.log("Seeding CrmStage…");
  for (const funnel of FUNNELS) {
    for (const stage of funnel.stages) {
      await prisma.crmStage.upsert({
        where: {
          marca_lineOfBusiness_order: {
            marca: funnel.marca,
            lineOfBusiness: funnel.lineOfBusiness,
            order: stage.order,
          },
        },
        update: {
          name: stage.name,
          isWon: stage.isWon ?? false,
          isLost: stage.isLost ?? false,
        },
        create: {
          marca: funnel.marca,
          lineOfBusiness: funnel.lineOfBusiness,
          name: stage.name,
          order: stage.order,
          isWon: stage.isWon ?? false,
          isLost: stage.isLost ?? false,
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
