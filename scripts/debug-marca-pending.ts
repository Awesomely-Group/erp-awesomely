import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main(): Promise<void> {
  // Totales por status
  const byStatus = await prisma.invoice.groupBy({ by: ["status"], _count: true });
  console.log("Por status:", byStatus.map((r) => `${r.status}: ${r._count}`).join(", "));

  // Facturas con marca Awesomely (cualquier status)
  const awesomely = await prisma.invoice.findMany({
    where: { OR: [
      { marca: "Awesomely" },
      { marca: { startsWith: "Awesomely," } },
      { marca: { contains: ",Awesomely," } },
      { marca: { endsWith: ",Awesomely" } },
    ]},
    select: { id: true, number: true, marca: true, status: true },
    take: 10,
  });
  console.log("Facturas con marca Awesomely (primeras 10):", JSON.stringify(awesomely, null, 2));

  // PENDING sin marca
  const pendingNoMarca = await prisma.invoice.count({ where: { status: "PENDING", marca: null } });
  console.log(`PENDING sin marca: ${pendingNoMarca}`);

  // PENDING con marca null — sample
  const sample = await prisma.invoice.findMany({
    where: { status: "PENDING" },
    select: { id: true, number: true, marca: true, companyId: true },
    take: 5,
  });
  console.log("Sample PENDING:", JSON.stringify(sample, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
