import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const buckets = await prisma.hourBucket.findMany({
    where: { code: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true },
  });

  console.log(`Buckets sin código: ${buckets.length}`);

  for (const b of buckets) {
    const year = b.createdAt.getFullYear();
    const prefix = `B${String(year).slice(-2)}`;
    const existing = await prisma.hourBucket.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });
    let maxNum = 0;
    for (const e of existing) {
      if (!e.code) continue;
      const num = parseInt(e.code.slice(3), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
    const code = `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
    await prisma.hourBucket.update({ where: { id: b.id }, data: { code } });
    console.log(`  ${code} → ${b.id}`);
  }

  console.log("Listo.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
