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
  email?: string;
  iban?: string;
  defaults?: { paymentMethod?: string | number };
};

async function getAllContacts(apiKey: string): Promise<HoldedContact[]> {
  const PAGE_SIZE = 500;
  const all = new Map<string, HoldedContact>();
  let prevFirstId: string | undefined;

  for (let page = 1; page <= 20; page++) {
    const batch = await holdedFetch<HoldedContact[]>(apiKey, "/contacts", {
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (batch.length === 0) break;
    const firstId = batch[0]?.id;
    if (page > 1 && firstId && firstId === prevFirstId) break;
    prevFirstId = firstId;
    for (const c of batch) if (!all.has(c.id)) all.set(c.id, c);
    if (batch.length < PAGE_SIZE) break;
  }

  return [...all.values()];
}

async function main(): Promise<void> {
  const company = await prisma.company.findFirst({
    where: { name: { contains: "SL" } },
    select: { id: true, name: true, holdedApiKey: true },
  });
  if (!company) { console.log("No se encontró Awesomely SL"); return; }
  console.log(`Empresa: ${company.name}\n`);

  // Obtener métodos de pago y construir mapa ID → nombre
  const paymentMethods = await holdedFetch<Array<{ id: string; name: string }>>(
    company.holdedApiKey, "/paymentmethods"
  );
  const pmNameMap = new Map(paymentMethods.map((p) => [p.id, p.name]));

  // Obtener todos los contactos de Holded
  const contacts = await getAllContacts(company.holdedApiKey);
  console.log(`Contactos Holded SL: ${contacts.length}`);

  // Obtener todos los suppliers del ERP para esta empresa
  const erpSuppliers = await prisma.supplier.findMany({
    where: { companyId: company.id },
    select: { holdedContactId: true, name: true, isPartner: true, active: true },
  });
  const erpMap = new Map(erpSuppliers.map((s) => [s.holdedContactId, s]));
  console.log(`Suppliers en ERP (empresa SL): ${erpSuppliers.length}`);

  // Cruzar: para cada contacto de Holded, ver si está en el ERP y qué clasificación tiene
  type Row = {
    holdedId: string;
    name: string;
    paymentMethodName: string;
    erpClasificacion: "Partner" | "Proveedor" | "No en ERP";
    active: boolean;
  };

  const rows: Row[] = contacts.map((c) => {
    const pmId = typeof c.defaults?.paymentMethod === "string" ? c.defaults.paymentMethod : undefined;
    const pmName = (pmId && pmId !== "0") ? (pmNameMap.get(pmId) ?? `ID: ${pmId}`) : "Sin método";
    const erp = erpMap.get(c.id);
    const erpClasificacion: Row["erpClasificacion"] = erp
      ? erp.isPartner ? "Partner" : "Proveedor"
      : "No en ERP";
    return {
      holdedId: c.id,
      name: c.name,
      paymentMethodName: pmName,
      erpClasificacion,
      active: erp?.active ?? false,
    };
  });

  // Resumen agrupado por método de pago × clasificación ERP
  console.log("\n=== Resumen: Método de pago × Clasificación ERP ===\n");

  const pmGroups = new Map<string, { Partner: number; Proveedor: number; "No en ERP": number }>();
  for (const r of rows) {
    const g = pmGroups.get(r.paymentMethodName) ?? { Partner: 0, Proveedor: 0, "No en ERP": 0 };
    g[r.erpClasificacion]++;
    pmGroups.set(r.paymentMethodName, g);
  }

  // Ordenar por total desc
  const sorted = [...pmGroups.entries()].sort(
    (a, b) => (b[1].Partner + b[1].Proveedor + b[1]["No en ERP"]) - (a[1].Partner + a[1].Proveedor + a[1]["No en ERP"])
  );

  const colPm   = 42;
  const colN    = 10;
  console.log(
    "Método de pago".padEnd(colPm) +
    "Partner".padStart(colN) +
    "Proveedor".padStart(colN) +
    "No en ERP".padStart(colN) +
    "TOTAL".padStart(colN)
  );
  console.log("─".repeat(colPm + colN * 4));
  for (const [pm, counts] of sorted) {
    const total = counts.Partner + counts.Proveedor + counts["No en ERP"];
    console.log(
      pm.padEnd(colPm) +
      String(counts.Partner).padStart(colN) +
      String(counts.Proveedor).padStart(colN) +
      String(counts["No en ERP"]).padStart(colN) +
      String(total).padStart(colN)
    );
  }

  // ── 1. Partners SIN transferencia bancaria ──────────────────────────────────
  const partnersNoTransfer = rows.filter(
    (r) => r.erpClasificacion === "Partner" && r.paymentMethodName !== "Transferencia bancaria"
  );
  console.log(`\n\n=== Partners SIN "Transferencia bancaria" (${partnersNoTransfer.length}) ===`);
  if (partnersNoTransfer.length === 0) {
    console.log("  Todos los partners tienen Transferencia bancaria.");
  } else {
    for (const r of partnersNoTransfer) {
      const activeFlag = r.active ? "" : " [inactivo]";
      console.log(`  · ${r.name.padEnd(45)} → ${r.paymentMethodName}${activeFlag}`);
    }
  }

  // ── 2. Proveedores SIN método de pago ────────────────────────────────────────
  const proveedoresSinMetodo = rows.filter(
    (r) => r.erpClasificacion === "Proveedor" && r.paymentMethodName === "Sin método"
  );
  console.log(`\n\n=== Proveedores SIN método de pago (${proveedoresSinMetodo.length}) ===`);
  for (const r of proveedoresSinMetodo) {
    const activeFlag = r.active ? "" : " [inactivo]";
    console.log(`  · ${r.name}${activeFlag}`);
  }

  // ── 3. Análisis de los 41 contactos Holded NO en ERP ────────────────────────
  const notInErp = rows.filter((r) => r.erpClasificacion === "No en ERP");

  // Para estos contactos necesitamos el dato original de Holded (tipo)
  const holdedMap = new Map(contacts.map((c) => [c.id, c]));

  // Categorizar por tipo Holded
  type NotInErpRow = {
    holdedId: string;
    name: string;
    paymentMethodName: string;
    holdedType: string;
    iban: string;
  };

  const notInErpDetail: NotInErpRow[] = notInErp.map((r) => {
    const hc = holdedMap.get(r.holdedId)!;
    return {
      holdedId: r.holdedId,
      name: r.name,
      paymentMethodName: r.paymentMethodName,
      holdedType: hc.type ?? "—",
      iban: hc.iban ?? "",
    };
  });

  // Agrupar por tipo Holded
  const byHoldedType = new Map<string, NotInErpRow[]>();
  for (const r of notInErpDetail) {
    const bucket = byHoldedType.get(r.holdedType) ?? [];
    bucket.push(r);
    byHoldedType.set(r.holdedType, bucket);
  }

  console.log(`\n\n=== Contactos Holded NO dados de alta en el ERP (${notInErpDetail.length}) ===`);
  console.log("Desglose por tipo en Holded:\n");

  for (const [hType, group] of [...byHoldedType.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  [Holded type: "${hType}"] (${group.length})`);
    for (const r of group) {
      const ibanFlag = r.iban ? ` | IBAN: ${r.iban.slice(0, 8)}…` : "";
      console.log(`    · ${r.name.padEnd(45)} | ${r.paymentMethodName}${ibanFlag}`);
    }
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
