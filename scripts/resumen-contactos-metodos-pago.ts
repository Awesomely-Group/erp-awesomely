import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const HOLDED_BASE = "https://api.holded.com/api/invoicing/v1";

async function holdedFetch<T>(apiKey: string, path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${HOLDED_BASE}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { key: apiKey } });
  if (!res.ok) throw new Error(`Holded ${res.status} ${path}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

type HoldedContact = {
  id: string;
  name: string;
  type?: string;
  defaults?: { paymentMethod?: string | number };
};

async function getAllContacts(apiKey: string): Promise<HoldedContact[]> {
  const all = new Map<string, HoldedContact>();
  let prevFirstId: string | undefined;
  for (let page = 1; page <= 20; page++) {
    const batch = await holdedFetch<HoldedContact[]>(apiKey, "/contacts", {
      page: String(page), limit: "500",
    });
    if (batch.length === 0) break;
    const firstId = batch[0]?.id;
    if (page > 1 && firstId && firstId === prevFirstId) break;
    prevFirstId = firstId;
    for (const c of batch) if (!all.has(c.id)) all.set(c.id, c);
    if (batch.length < 500) break;
  }
  return [...all.values()];
}

async function analyzeCompany(company: { id: string; name: string; holdedApiKey: string }): Promise<void> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  ${company.name}`);
  console.log(`${"═".repeat(70)}\n`);

  const [paymentMethods, contacts, erpSuppliers] = await Promise.all([
    holdedFetch<Array<{ id: string; name: string }>>(company.holdedApiKey, "/paymentmethods"),
    getAllContacts(company.holdedApiKey),
    prisma.supplier.findMany({
      where: { companyId: company.id },
      select: { holdedContactId: true, name: true, isPartner: true, active: true },
    }),
  ]);

  const pmNameMap = new Map(paymentMethods.map((p) => [p.id, p.name]));
  const erpMap    = new Map(erpSuppliers.map((s) => [s.holdedContactId, s]));

  type Row = {
    name: string;
    rol: "Partner" | "Proveedor" | "No en ERP";
    holdedType: string;
    paymentMethod: string;
    active: boolean;
  };

  const rows: Row[] = contacts.map((c) => {
    const erp = erpMap.get(c.id);
    const pmId = typeof c.defaults?.paymentMethod === "string" && c.defaults.paymentMethod !== "0"
      ? c.defaults.paymentMethod : undefined;
    const pmName = pmId ? (pmNameMap.get(pmId) ?? `ID:${pmId}`) : "Sin método";
    const rol: Row["rol"] = erp
      ? (erp.isPartner ? "Partner" : "Proveedor")
      : "No en ERP";
    return {
      name: c.name,
      rol,
      holdedType: c.type ?? "—",
      paymentMethod: pmName,
      active: erp?.active ?? false,
    };
  });

  // ── Resumen por rol × método de pago ──────────────────────────────────────
  const partners   = rows.filter((r) => r.rol === "Partner");
  const proveedores = rows.filter((r) => r.rol === "Proveedor");
  const noErp      = rows.filter((r) => r.rol === "No en ERP");

  for (const [label, group] of [
    ["Partners", partners],
    ["Proveedores", proveedores],
    ["No en ERP", noErp],
  ] as [string, Row[]][]) {
    if (group.length === 0) continue;

    // Agrupar por método de pago
    const byPm = new Map<string, Row[]>();
    for (const r of group) {
      const bucket = byPm.get(r.paymentMethod) ?? [];
      bucket.push(r);
      byPm.set(r.paymentMethod, bucket);
    }
    const pmSorted = [...byPm.entries()].sort((a, b) => b[1].length - a[1].length);

    console.log(`── ${label} (${group.length}) ${"─".repeat(50 - label.length - String(group.length).length)}`);

    // Tabla resumen de métodos
    for (const [pm, list] of pmSorted) {
      const bar = "▪".repeat(Math.min(list.length, 30));
      console.log(`   ${pm.padEnd(38)} ${String(list.length).padStart(3)}  ${bar}`);
    }

    // Detalle por método
    for (const [pm, list] of pmSorted) {
      const namesSorted = [...list].sort((a, b) => a.name.localeCompare(b.name));
      console.log(`\n   [${pm}]`);
      for (const r of namesSorted) {
        const flags = [
          r.rol === "No en ERP" ? `holded:${r.holdedType}` : "",
          !r.active && r.rol !== "No en ERP" ? "inactivo" : "",
        ].filter(Boolean).join(", ");
        console.log(`     · ${r.name}${flags ? `  (${flags})` : ""}`);
      }
    }
    console.log();
  }
}

async function main(): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { active: true },
    select: { id: true, name: true, holdedApiKey: true },
    orderBy: { name: "asc" },
  });

  for (const company of companies) {
    await analyzeCompany(company);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
