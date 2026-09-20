/**
 * Carga cuentas y contactos del CRM desde un JSON, de forma idempotente.
 *
 * Existe porque no hay —ni conviene que haya— una API de escritura del CRM: el ERP solo
 * expone webhooks de entrada, y la acción `createAccount` de la UI ni siquiera acepta
 * `lifecycle`, `companyId` ni `holdedContactId`, que son los tres campos sin los cuales
 * el portal de cliente no encuentra a nadie. Un fichero + este script evita abrir una
 * superficie de escritura nueva para una carga que se hace cuatro veces en la vida.
 *
 *   pnpm tsx scripts/import-crm.ts datos.json            # valida y enseña qué haría
 *   pnpm tsx scripts/import-crm.ts datos.json --apply    # escribe
 *
 * Formato del fichero en docs/crm-import.md. Nada se escribe si hay un solo error de
 * validación: media carga es peor que ninguna, porque deja que adivinar qué entró.
 */
import { readFileSync } from "node:fs";
import { PrismaClient, type CrmAccountLifecycle } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { MARCA_OPTIONS } from "../src/lib/org";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

const LIFECYCLES: CrmAccountLifecycle[] = ["LEAD", "QUALIFIED", "CUSTOMER", "CHURNED", "DISQUALIFIED"];
const MARCAS = new Set(MARCA_OPTIONS.map((o) => o.value));

interface ContactInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  role?: unknown;
}

interface AccountInput {
  name?: unknown;
  marca?: unknown;
  lifecycle?: unknown;
  domain?: unknown;
  vatNumber?: unknown;
  /** Nombre de la entidad legal en el ERP ("Awesomely SL"). Se resuelve a `companyId`. */
  companyName?: unknown;
  /** Id del contacto en Holded. Es la llave que cruza con facturas y proformas. */
  holdedContactId?: unknown;
  contacts?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  const APPLY = process.argv.includes("--apply");
  if (!file || file.startsWith("--")) {
    console.error("Uso: pnpm tsx scripts/import-crm.ts <fichero.json> [--apply]");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(file, "utf8")) as { accounts?: unknown };
  if (!Array.isArray(raw.accounts)) {
    console.error('El fichero debe tener una clave "accounts" con una lista.');
    process.exit(1);
  }
  const accounts = raw.accounts as AccountInput[];

  console.log(APPLY ? "MODO ESCRITURA (--apply)\n" : "SIMULACRO — nada se escribe. Añade --apply para aplicar.\n");

  // ── Validación completa antes de tocar nada ──────────────────────────────────
  const errores: string[] = [];
  const avisos: string[] = [];
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const companyByName = new Map(companies.map((c) => [c.name.toLowerCase(), c.id]));

  const holdedVistos = new Map<string, string>();
  const emailVistos = new Map<string, string[]>();

  accounts.forEach((a, i) => {
    const donde = `cuenta #${i + 1}${str(a.name) ? ` (${str(a.name)})` : ""}`;
    if (!str(a.name)) errores.push(`${donde}: falta "name"`);

    const marca = str(a.marca);
    if (marca !== null && !MARCAS.has(marca)) {
      errores.push(`${donde}: marca "${marca}" no existe. Válidas: ${[...MARCAS].join(", ")}`);
    }

    const lifecycle = str(a.lifecycle);
    if (lifecycle !== null && !LIFECYCLES.includes(lifecycle as CrmAccountLifecycle)) {
      errores.push(`${donde}: lifecycle "${lifecycle}" no existe. Válidos: ${LIFECYCLES.join(", ")}`);
    }

    const companyName = str(a.companyName);
    if (companyName !== null && !companyByName.has(companyName.toLowerCase())) {
      errores.push(`${donde}: la entidad "${companyName}" no existe. Hay: ${companies.map((c) => c.name).join(", ")}`);
    }

    const holded = str(a.holdedContactId);
    if (holded !== null) {
      const previo = holdedVistos.get(holded);
      if (previo !== undefined) errores.push(`${donde}: comparte holdedContactId con "${previo}"`);
      else holdedVistos.set(holded, str(a.name) ?? donde);
    }

    // Para que el portal pueda enseñar facturas hacen falta las dos cosas.
    if ((holded === null) !== (companyName === null)) {
      avisos.push(`${donde}: tiene ${holded ? "holdedContactId sin entidad" : "entidad sin holdedContactId"} — sin los dos no verá facturas en el portal`);
    }

    const contacts = Array.isArray(a.contacts) ? (a.contacts as ContactInput[]) : [];
    contacts.forEach((c, j) => {
      if (!str(c.name)) errores.push(`${donde}, contacto #${j + 1}: falta "name"`);
      const email = str(c.email);
      if (email !== null) {
        if (!email.includes("@")) errores.push(`${donde}: "${email}" no parece un correo`);
        const clave = email.toLowerCase();
        emailVistos.set(clave, [...(emailVistos.get(clave) ?? []), str(a.name) ?? donde]);
      }
    });
  });

  // El portal resuelve al cliente por el correo de la persona. Si el mismo correo está
  // en dos cuentas devuelve 409 y esa persona NO PUEDE ENTRAR — a propósito, porque la
  // alternativa sería adivinar y enseñarle las facturas de otro. Se caza aquí.
  for (const [email, cuentas] of emailVistos) {
    if (cuentas.length > 1) {
      errores.push(`el correo ${email} está en ${cuentas.length} cuentas (${cuentas.join(", ")}) — quien lo use no podrá entrar al portal`);
    }
  }

  if (errores.length > 0) {
    console.error(`${errores.length} error(es) — no se escribe nada:\n`);
    errores.forEach((e) => console.error(`  ✗ ${e}`));
    await prisma.$disconnect();
    process.exit(1);
  }
  avisos.forEach((a) => console.log(`  ⚠ ${a}`));
  if (avisos.length > 0) console.log("");

  // ── Carga ────────────────────────────────────────────────────────────────────
  let creadas = 0, actualizadas = 0, contactosNuevos = 0, contactosActualizados = 0;

  for (const a of accounts) {
    const name = str(a.name)!;
    const marca = str(a.marca);
    const holdedContactId = str(a.holdedContactId);
    const companyName = str(a.companyName);
    const companyId = companyName === null ? null : companyByName.get(companyName.toLowerCase())!;
    const lifecycle = (str(a.lifecycle) ?? "LEAD") as CrmAccountLifecycle;

    // Idempotencia: el par (entidad, contacto de Holded) es la llave real —la misma con
    // la que el ERP cruza facturas y proformas—. Sin ella, el nombre y la marca.
    const existente =
      holdedContactId !== null && companyId !== null
        ? await prisma.crmAccount.findFirst({ where: { companyId, holdedContactId } })
        : await prisma.crmAccount.findFirst({ where: { name, marca } });

    const datos = { name, marca, lifecycle, domain: str(a.domain), vatNumber: str(a.vatNumber), companyId, holdedContactId };

    let accountId: string;
    if (existente === null) {
      console.log(`  + ${name} · ${lifecycle} · ${marca ?? "sin marca"}`);
      creadas += 1;
      accountId = APPLY ? (await prisma.crmAccount.create({ data: datos, select: { id: true } })).id : "(simulacro)";
    } else {
      console.log(`  ~ ${name} · ya existe, se actualiza`);
      actualizadas += 1;
      accountId = existente.id;
      if (APPLY) await prisma.crmAccount.update({ where: { id: existente.id }, data: datos });
    }

    const contacts = Array.isArray(a.contacts) ? (a.contacts as ContactInput[]) : [];
    for (const c of contacts) {
      const cn = str(c.name)!;
      const email = str(c.email);
      const datosC = { name: cn, email, phone: str(c.phone), role: str(c.role) };

      if (!APPLY) {
        console.log(`      · ${cn}${email ? ` <${email}>` : ""}`);
        contactosNuevos += 1;
        continue;
      }

      // Un contacto se identifica por su correo dentro de la cuenta; sin correo, por el
      // nombre. Dos personas distintas sin correo y con el mismo nombre en la misma
      // cuenta se fusionarían, pero eso es preferible a duplicarlas en cada pasada.
      const previo = await prisma.crmContact.findFirst({
        where: email !== null ? { accountId, email } : { accountId, name: cn },
      });
      if (previo === null) {
        await prisma.crmContact.create({ data: { accountId, ...datosC } });
        contactosNuevos += 1;
      } else {
        await prisma.crmContact.update({ where: { id: previo.id }, data: datosC });
        contactosActualizados += 1;
      }
    }
  }

  console.log(
    `\n${APPLY ? "Hecho" : "Se haría"}: ${creadas} cuentas nuevas · ${actualizadas} actualizadas · ` +
      `${contactosNuevos} contactos nuevos${contactosActualizados > 0 ? ` · ${contactosActualizados} actualizados` : ""}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
