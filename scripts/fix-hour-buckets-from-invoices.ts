/**
 * Cuadra las bolsas de horas del ERP con lo que de verdad se facturó en Holded.
 *
 * Al cruzar las líneas de factura de Awesomely SL con las bolsas dadas de alta
 * (2026-09-20) aparecieron 12 desajustes en los cuatro clientes con bolsas. La causa de
 * fondo es que **las horas viven en el texto de la línea** ("Bolsa 20h Backend
 * Developer"), no en `quantity` —que siempre es 1—, así que nadie las había cruzado y el
 * alta se hacía a ojo. Efecto: Quicksmile y Colvin parecían estar por encima de lo
 * contratado cuando en realidad les sobraban horas.
 *
 * Cada corrección lleva abajo su factura y su motivo. Las decisiones que no salían de la
 * evidencia las tomó Jaume el 2026-09-21 y van anotadas caso por caso.
 *
 *   pnpm tsx scripts/fix-hour-buckets-from-invoices.ts            # simulacro
 *   pnpm tsx scripts/fix-hour-buckets-from-invoices.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
const APPLY = process.argv.includes("--apply");

/** Alta de una bolsa que se facturó y nunca se registró. */
interface Alta {
  tipo: "alta";
  proyecto: string;
  rol: string;
  horas: number;
  inicio: string;
  factura: string;
  motivo: string;
}
/** Corrección de una bolsa existente, localizada por su código. */
interface Ajuste {
  tipo: "ajuste";
  proyecto: string;
  code: string;
  horas?: number;
  inicio?: string;
  motivo: string;
}

const CAMBIOS: (Alta | Ajuste)[] = [
  // ── Quicksmile ───────────────────────────────────────────────────────────────
  // Q4: F250019 dice "Bolsa 20h" pero se emitió y cobró por 862,13 €, que es el precio
  // de las de 10 h (las de 20 h van a 1.350 €). No hay rectificativa ni abono: la
  // factura está cobrada al céntimo tal cual. Decisión de Jaume: manda el precio.
  { tipo: "alta", proyecto: "BUB", rol: "Backend Dev", horas: 10, inicio: "2025-11-03",
    factura: "F250019", motivo: "Q2+Q4: el 3-nov hay dos facturas y solo una bolsa; esta va a 10 h porque su precio es el de 10 h" },
  { tipo: "alta", proyecto: "BUB", rol: "PM", horas: 10, inicio: "2025-10-27",
    factura: "F250016", motivo: "Q1: la factura trae dos líneas (10 h PM + 10 h BD) y solo se registró la de Backend" },
  { tipo: "alta", proyecto: "BUB", rol: "Backend Dev", horas: 10, inicio: "2026-06-17",
    factura: "F260035", motivo: "Q3: facturada y nunca dada de alta" },

  // ── Bourne ───────────────────────────────────────────────────────────────────
  { tipo: "alta", proyecto: "GB", rol: "DevOps", horas: 2, inicio: "2026-04-02",
    factura: "F260022", motivo: "B1: línea suelta de 2 h DevOps (260 €) en la misma factura de la bolsa de 30 h" },

  // ── Colvin ───────────────────────────────────────────────────────────────────
  // C1/C2: las bolsas de 65 h y 64 h son la factura entera sumada (50 BD + 10 PM + 5
  // DevOps = 65; 50 BD + 10 PM + 4 BD = 64). Se recortan a lo que era Backend y se sacan
  // los otros roles a su propia bolsa: es la causa de que las horas de PM y DevOps de
  // Colvin no tuvieran dónde imputarse.
  { tipo: "ajuste", proyecto: "GC", code: "B260011", horas: 50,
    motivo: "C1: era 50 BD + 10 PM + 5 DevOps sumados como Backend; se queda solo con los 50 de Backend" },
  { tipo: "alta", proyecto: "GC", rol: "PM", horas: 10, inicio: "2025-12-10",
    factura: "F250028", motivo: "C1: los 10 h de PM que estaban dentro de la bolsa de 65" },
  { tipo: "alta", proyecto: "GC", rol: "DevOps", horas: 5, inicio: "2025-12-10",
    factura: "F250028", motivo: "C1: las 5 h de DevOps que estaban dentro de la bolsa de 65" },
  { tipo: "ajuste", proyecto: "GC", code: "B260012", horas: 54,
    motivo: "C2: era 50 BD + 10 PM + 4 BD sumados; los 4 h de 'Servicio Backend' sí son Backend, los 10 de PM no" },
  { tipo: "alta", proyecto: "GC", rol: "PM", horas: 10, inicio: "2026-01-08",
    factura: "F260002", motivo: "C2: los 10 h de PM que estaban dentro de la bolsa de 64" },
  // C3: "Fee mensual Backend Developer Servicio 20h/mes" a 2.400 €. Colvin nunca tuvo un
  // fee (Jaume), y 2.400 € es exactamente lo que costaba una bolsa de 20 h en marzo
  // (F260012); en enero costaban 1.350 (F260005), así que la subida cae entre medias.
  // Es una bolsa con la etiqueta mal puesta.
  { tipo: "alta", proyecto: "GC", rol: "Backend Dev", horas: 20, inicio: "2026-01-30",
    factura: "F260006", motivo: "C3: etiquetada 'fee mensual' pero es una bolsa de 20 h — mismo precio que F260012" },
  { tipo: "alta", proyecto: "GC", rol: "Backend Dev", horas: 20, inicio: "2026-03-05", factura: "F260012", motivo: "C4: facturada y nunca dada de alta" },
  { tipo: "alta", proyecto: "GC", rol: "Backend Dev", horas: 10, inicio: "2026-03-25", factura: "F260017", motivo: "C4: facturada y nunca dada de alta" },
  { tipo: "alta", proyecto: "GC", rol: "Backend Dev", horas: 10, inicio: "2026-03-28", factura: "F260020", motivo: "C4: facturada y nunca dada de alta" },
  { tipo: "alta", proyecto: "GC", rol: "Backend Dev", horas: 10, inicio: "2026-04-08", factura: "F260024", motivo: "C4: facturada y nunca dada de alta" },

  // ── Z1 Gestión ───────────────────────────────────────────────────────────────
  // Z1: la factura vende UNA bolsa de 50 h "(Backend Dev + DevOps)" y en el ERP estaba
  // partida en 50 + 5 = 55. Se reparte 45 + 5 para que sume los 50 facturados
  // (decisión de Jaume; el corte no sale de la factura).
  { tipo: "ajuste", proyecto: "GZG", code: "B260001", horas: 45, inicio: "2026-05-01",
    motivo: "Z1: 45+5 para sumar los 50 facturados. Inicio a primeros de mayo: la factura es del 14 y se trabajó antes, que es lo normal" },
  { tipo: "ajuste", proyecto: "GZG", code: "B260002", inicio: "2026-05-01",
    motivo: "Z1: mismo inicio, para que cubra el trabajo que pagó" },
  { tipo: "alta", proyecto: "GZG", rol: "Backend Dev", horas: 1.5, inicio: "2025-12-16", factura: "F250029", motivo: "Z2: consultoría suelta nunca registrada" },
  { tipo: "alta", proyecto: "GZG", rol: "Data Analyst", horas: 1.5, inicio: "2025-12-16", factura: "F250029", motivo: "Z2: consultoría suelta nunca registrada" },
];

/** Un año, que es la caducidad estándar de una bolsa. */
function finDeBolsa(inicio: string): Date {
  const d = new Date(`${inicio}T00:00:00.000Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}

async function main(): Promise<void> {
  console.log(APPLY ? "MODO ESCRITURA (--apply)\n" : "SIMULACRO — nada se escribe. Añade --apply para aplicar.\n");

  const roles = await prisma.roleTemplate.findMany({ select: { id: true, name: true, active: true } });
  const rolePorNombre = new Map(roles.map((r) => [r.name.toLowerCase(), r]));

  // Validación antes de tocar nada: sin rol o sin proyecto no se escribe nada.
  const errores: string[] = [];
  for (const c of CAMBIOS) {
    const p = await prisma.jiraProject.findFirst({ where: { jiraKey: c.proyecto }, select: { id: true } });
    if (!p) errores.push(`No existe el proyecto ${c.proyecto}`);
    if (c.tipo === "alta" && !rolePorNombre.has(c.rol.toLowerCase())) {
      errores.push(`No existe el rol "${c.rol}" (hay: ${roles.map((r) => r.name).join(", ")})`);
    }
    if (c.tipo === "ajuste") {
      const b = await prisma.hourBucket.findUnique({ where: { code: c.code }, select: { id: true } });
      if (!b) errores.push(`No existe la bolsa ${c.code}`);
    }
  }
  if (errores.length > 0) {
    console.error("No se escribe nada:\n");
    [...new Set(errores)].forEach((e) => console.error(`  ✗ ${e}`));
    await prisma.$disconnect();
    process.exit(1);
  }

  for (const c of CAMBIOS) {
    const project = (await prisma.jiraProject.findFirst({ where: { jiraKey: c.proyecto }, select: { id: true } }))!;
    if (c.tipo === "alta") {
      const role = rolePorNombre.get(c.rol.toLowerCase())!;
      console.log(`  + ${c.proyecto} · ${c.horas}h ${c.rol} · desde ${c.inicio} · ${c.factura}`);
      console.log(`      ${c.motivo}`);
      if (APPLY) {
        await prisma.hourBucket.create({
          data: {
            projectId: project.id, roleId: role.id, totalHours: c.horas,
            startDate: new Date(`${c.inicio}T00:00:00.000Z`), endDate: finDeBolsa(c.inicio),
          },
        });
      }
    } else {
      const actual = await prisma.hourBucket.findUnique({ where: { code: c.code }, select: { totalHours: true } });
      console.log(`  ~ ${c.proyecto} · ${c.code}: ${actual?.totalHours}h${c.horas !== undefined ? ` → ${c.horas}h` : ""}${c.inicio !== undefined ? ` · inicio → ${c.inicio}` : ""}`);
      console.log(`      ${c.motivo}`);
      if (APPLY) {
        await prisma.hourBucket.update({
          where: { code: c.code },
          data: {
            ...(c.horas !== undefined ? { totalHours: c.horas } : {}),
            ...(c.inicio !== undefined ? { startDate: new Date(`${c.inicio}T00:00:00.000Z`), endDate: finDeBolsa(c.inicio) } : {}),
          },
        });
      }
    }
  }

  const altas = CAMBIOS.filter((c) => c.tipo === "alta").length;
  console.log(`\n${APPLY ? "Aplicado" : "Se aplicaría"}: ${altas} bolsas nuevas · ${CAMBIOS.length - altas} ajustes`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
