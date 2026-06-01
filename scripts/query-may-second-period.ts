import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const from = new Date("2026-05-16");
  const to = new Date("2026-05-31T23:59:59.999Z");

  const invoices = await prisma.invoice.findMany({
    where: {
      type: { in: ["PURCHASE", "SALE"] },
      dueDate: { gte: from, lte: to },
    },
    include: {
      company: { select: { name: true } },
      erpPayments: true,
    },
    orderBy: [{ type: "asc" }, { dueDate: "asc" }],
  });

  type Row = {
    tipo: string;
    numero: string;
    contraparte: string;
    empresa: string;
    vencimiento: string;
    total: string;
    pendiente: string;
  };

  const results: Row[] = [];
  for (const inv of invoices) {
    const erpPaid = inv.erpPayments.reduce((s, p) => s + Number(p.amount), 0);
    const holdedPending = Number(inv.paymentsPending);
    const effectivePending =
      inv.type === "PURCHASE"
        ? Math.max(0, holdedPending - erpPaid)
        : Math.max(0, holdedPending);

    if (effectivePending <= 0.005) continue;

    results.push({
      tipo: inv.type === "PURCHASE" ? "PAGO" : "COBRO",
      numero: inv.number ?? inv.holdedId.slice(0, 8),
      contraparte: inv.counterparty ?? "—",
      empresa: inv.company.name,
      vencimiento: inv.dueDate?.toISOString().slice(0, 10) ?? "sin fecha",
      total: Number(inv.totalEur).toFixed(2),
      pendiente: effectivePending.toFixed(2),
    });
  }

  const pagos = results.filter((r) => r.tipo === "PAGO");
  const cobros = results.filter((r) => r.tipo === "COBRO");

  console.log("=== PAGOS PENDIENTES (2ª quincena Mayo 2026) ===");
  for (const r of pagos) {
    console.log(`[${r.vencimiento}] ${r.contraparte.padEnd(35)} | ${r.numero.padEnd(15)} | ${r.empresa.padEnd(20)} | ${r.pendiente}€`);
  }
  const totalPagos = pagos.reduce((s, r) => s + parseFloat(r.pendiente), 0);
  console.log(`\nTOTAL PAGOS: ${totalPagos.toFixed(2)}€ (${pagos.length} facturas)`);

  console.log("\n=== COBROS PENDIENTES (2ª quincena Mayo 2026) ===");
  for (const r of cobros) {
    console.log(`[${r.vencimiento}] ${r.contraparte.padEnd(35)} | ${r.numero.padEnd(15)} | ${r.empresa.padEnd(20)} | ${r.pendiente}€`);
  }
  const totalCobros = cobros.reduce((s, r) => s + parseFloat(r.pendiente), 0);
  console.log(`\nTOTAL COBROS: ${totalCobros.toFixed(2)}€ (${cobros.length} facturas)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
