/**
 * Carga cuentas, contactos, relaciones entre cuentas y oportunidades del CRM desde un
 * JSON, de forma idempotente.
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
import {
  PrismaClient,
  type CrmAccountLifecycle,
  type CrmAccountType,
  type CrmDealType,
  type CrmDecisionRole,
  type CrmLeadOrigin,
  type CrmRelationType,
} from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { MARCA_OPTIONS } from "../src/lib/org";

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

const LIFECYCLES: CrmAccountLifecycle[] = ["LEAD", "QUALIFIED", "CUSTOMER", "CHURNED", "DISQUALIFIED"];
const ACCOUNT_TYPES: CrmAccountType[] = ["CLIENT", "PARTNER"];
const RELATION_TYPES: CrmRelationType[] = ["HOLDING_OF", "SUBSIDIARY_OF", "SIBLING_OF", "SUPPLIER_OF", "ADVISOR_OF"];
const DEAL_TYPES: CrmDealType[] = ["NEW_BUSINESS", "EXPANSION", "RENEWAL"];
const ORIGINS: CrmLeadOrigin[] = ["INSIDE_OUT", "OUTSIDE_IN", "REFERRAL", "INBOUND", "PARTNER"];
const DECISION_ROLES: CrmDecisionRole[] = ["DECISOR", "PRESCRIPTOR", "ASESOR_EXTERNO", "TECNICO", "ADMINISTRATIVO", "USUARIO"];
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
  /** "CLIENT" (por defecto) o "PARTNER" para prescriptores: Z1 Gestión, Holded, Odoo. */
  type?: unknown;
  /** Nombre de la cuenta prescriptora que trajo esta. Debe existir o estar en el fichero. */
  referredBy?: unknown;
}

interface RelationInput {
  from?: unknown;
  to?: unknown;
  type?: unknown;
  note?: unknown;
}

interface LeadContactInput {
  /** Correo de la persona. Puede ser de OTRA cuenta: es el caso del asesor externo. */
  email?: unknown;
  role?: unknown;
}

interface LeadInput {
  name?: unknown;
  marca?: unknown;
  lineOfBusiness?: unknown;
  /** Nombre de la etapa dentro del funnel de esa marca/línea ("Propuesta enviada"). */
  stage?: unknown;
  /** Nombre de la cuenta a la que cuelga. Opcional: un lead puede no tener cuenta aún. */
  account?: unknown;
  /**
   * Llave de idempotencia. Obligatoria: sin ella una segunda pasada duplicaría los
   * leads, porque a diferencia de las cuentas no hay par (entidad, contacto) que los
   * identifique de forma natural.
   */
  externalRef?: unknown;
  dealType?: unknown;
  origin?: unknown;
  market?: unknown;
  seats?: unknown;
  amount?: unknown;
  contactName?: unknown;
  email?: unknown;
  phone?: unknown;
  notes?: unknown;
  contacts?: unknown;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  const APPLY = process.argv.includes("--apply");
  if (!file || file.startsWith("--")) {
    console.error("Uso: pnpm tsx scripts/import-crm.ts <fichero.json> [--apply]");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    accounts?: unknown;
    relations?: unknown;
    leads?: unknown;
  };
  if (!Array.isArray(raw.accounts)) {
    console.error('El fichero debe tener una clave "accounts" con una lista.');
    process.exit(1);
  }
  const accounts = raw.accounts as AccountInput[];
  const relations = Array.isArray(raw.relations) ? (raw.relations as RelationInput[]) : [];
  const leads = Array.isArray(raw.leads) ? (raw.leads as LeadInput[]) : [];

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

    const tipo = str(a.type);
    if (tipo !== null && !ACCOUNT_TYPES.includes(tipo as CrmAccountType)) {
      errores.push(`${donde}: type "${tipo}" no existe. Válidos: ${ACCOUNT_TYPES.join(", ")}`);
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

  // ── Relaciones y oportunidades ───────────────────────────────────────────────
  // Los nombres de cuenta se resuelven contra el fichero Y contra lo ya cargado: una
  // segunda pasada puede añadir leads a cuentas que entraron en la primera.
  const nombresEnFichero = new Set(accounts.map((a) => str(a.name)).filter((n): n is string => n !== null));
  const cuentasEnBd = await prisma.crmAccount.findMany({ select: { name: true } });
  const nombresConocidos = new Set([...nombresEnFichero, ...cuentasEnBd.map((c) => c.name)]);

  const exigeCuenta = (nombre: string | null, donde: string, campo: string): void => {
    if (nombre !== null && !nombresConocidos.has(nombre)) {
      errores.push(`${donde}: ${campo} "${nombre}" no es ninguna cuenta del fichero ni de la base`);
    }
  };

  accounts.forEach((a, i) => {
    exigeCuenta(str(a.referredBy), `cuenta #${i + 1}${str(a.name) ? ` (${str(a.name)})` : ""}`, "referredBy");
    if (str(a.referredBy) !== null && str(a.referredBy) === str(a.name)) {
      errores.push(`cuenta "${str(a.name)}": no puede ser su propio prescriptor`);
    }
  });

  relations.forEach((r, i) => {
    const donde = `relación #${i + 1}`;
    const from = str(r.from);
    const to = str(r.to);
    if (from === null) errores.push(`${donde}: falta "from"`);
    if (to === null) errores.push(`${donde}: falta "to"`);
    if (from !== null && from === to) errores.push(`${donde}: una cuenta no se relaciona consigo misma`);
    exigeCuenta(from, donde, "from");
    exigeCuenta(to, donde, "to");
    const tipo = str(r.type);
    if (tipo === null || !RELATION_TYPES.includes(tipo as CrmRelationType)) {
      errores.push(`${donde}: type "${tipo}" no existe. Válidos: ${RELATION_TYPES.join(", ")}`);
    }
  });

  // Etapas existentes por marca+línea. No se crean al vuelo: el funnel se siembra aparte
  // y a conciencia (scripts/seed-growth-crm.ts), no como efecto secundario de una carga.
  const stages = await prisma.crmStage.findMany({ select: { id: true, marca: true, lineOfBusiness: true, name: true } });
  const stageKey = (marca: string, linea: string, nombre: string): string => `${marca}|${linea}|${nombre.toLowerCase()}`;
  const stageById = new Map(stages.map((s) => [stageKey(s.marca, s.lineOfBusiness, s.name), s.id]));

  const refsVistas = new Set<string>();
  leads.forEach((l, i) => {
    const donde = `oportunidad #${i + 1}${str(l.name) ? ` (${str(l.name)})` : ""}`;
    if (!str(l.name)) errores.push(`${donde}: falta "name"`);

    const marca = str(l.marca);
    if (marca === null || !MARCAS.has(marca)) {
      errores.push(`${donde}: marca "${marca}" no existe. Válidas: ${[...MARCAS].join(", ")}`);
    }

    const ref = str(l.externalRef);
    if (ref === null) {
      errores.push(`${donde}: falta "externalRef" — sin él una segunda pasada duplicaría el lead`);
    } else if (refsVistas.has(ref)) {
      errores.push(`${donde}: externalRef "${ref}" repetido en el fichero`);
    } else {
      refsVistas.add(ref);
    }

    const linea = str(l.lineOfBusiness) ?? "GENERAL";
    const etapa = str(l.stage);
    if (etapa === null) {
      errores.push(`${donde}: falta "stage"`);
    } else if (marca !== null && !stageById.has(stageKey(marca, linea, etapa))) {
      const disponibles = stages
        .filter((s) => s.marca === marca && s.lineOfBusiness === linea)
        .map((s) => s.name);
      errores.push(
        `${donde}: la etapa "${etapa}" no existe en ${marca} / ${linea}. ` +
          (disponibles.length > 0 ? `Hay: ${disponibles.join(", ")}` : "Ese funnel no tiene etapas sembradas"),
      );
    }

    exigeCuenta(str(l.account), donde, "account");

    const dealType = str(l.dealType);
    if (dealType !== null && !DEAL_TYPES.includes(dealType as CrmDealType)) {
      errores.push(`${donde}: dealType "${dealType}" no existe. Válidos: ${DEAL_TYPES.join(", ")}`);
    }
    const origin = str(l.origin);
    if (origin !== null && !ORIGINS.includes(origin as CrmLeadOrigin)) {
      errores.push(`${donde}: origin "${origin}" no existe. Válidos: ${ORIGINS.join(", ")}`);
    }

    const contactos = Array.isArray(l.contacts) ? (l.contacts as LeadContactInput[]) : [];
    contactos.forEach((c, j) => {
      const email = str(c.email);
      if (email === null) {
        errores.push(`${donde}, persona #${j + 1}: hace falta "email" para identificarla`);
      }
      const rol = str(c.role);
      if (rol !== null && !DECISION_ROLES.includes(rol as CrmDecisionRole)) {
        errores.push(`${donde}, persona #${j + 1}: role "${rol}" no existe. Válidos: ${DECISION_ROLES.join(", ")}`);
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
  let relacionesNuevas = 0, leadsNuevos = 0, leadsActualizados = 0, personasEnLeads = 0;
  const idPorNombre = new Map<string, string>();

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
      accountId = APPLY ? (await prisma.crmAccount.create({ data: datos, select: { id: true } })).id : `(simulacro:${name})`;
    } else {
      console.log(`  ~ ${name} · ya existe, se actualiza`);
      actualizadas += 1;
      accountId = existente.id;
      if (APPLY) await prisma.crmAccount.update({ where: { id: existente.id }, data: datos });
    }
    idPorNombre.set(name, accountId);

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

  // Las cuentas de la base que no venían en el fichero también pueden ser destino de una
  // relación o de un lead, así que se completa el índice de nombres.
  if (APPLY) {
    const todas = await prisma.crmAccount.findMany({ select: { id: true, name: true } });
    for (const c of todas) if (!idPorNombre.has(c.name)) idPorNombre.set(c.name, c.id);
  }
  const resolver = (nombre: string | null): string | null =>
    nombre === null ? null : (idPorNombre.get(nombre) ?? null);

  // ── Prescriptores (segunda pasada: el partner puede venir después en el fichero) ──
  for (const a of accounts) {
    const name = str(a.name)!;
    const referredBy = str(a.referredBy);
    const tipo = str(a.type) as CrmAccountType | null;
    if (referredBy === null && tipo === null) continue;

    const accountId = resolver(name);
    const referredByAccountId = resolver(referredBy);
    if (!APPLY) {
      console.log(`  → ${name}${tipo ? ` · ${tipo}` : ""}${referredBy ? ` · vía ${referredBy}` : ""}`);
      continue;
    }
    if (accountId === null) continue;
    await prisma.crmAccount.update({
      where: { id: accountId },
      data: {
        ...(tipo !== null ? { type: tipo } : {}),
        ...(referredBy !== null ? { referredByAccountId } : {}),
      },
    });
  }

  // ── Relaciones entre cuentas ─────────────────────────────────────────────────
  for (const r of relations) {
    const from = str(r.from)!;
    const to = str(r.to)!;
    const tipo = str(r.type) as CrmRelationType;
    if (!APPLY) {
      console.log(`  ↔ ${from} — ${tipo} → ${to}`);
      relacionesNuevas += 1;
      continue;
    }
    const fromAccountId = resolver(from);
    const toAccountId = resolver(to);
    if (fromAccountId === null || toAccountId === null) continue;
    // upsert sobre @@unique([fromAccountId, toAccountId, type]): repetir la carga no
    // duplica la relación ni pierde la nota si se corrigió en el fichero.
    await prisma.crmAccountRelation.upsert({
      where: { fromAccountId_toAccountId_type: { fromAccountId, toAccountId, type: tipo } },
      update: { note: str(r.note) },
      create: { fromAccountId, toAccountId, type: tipo, note: str(r.note) },
    });
    relacionesNuevas += 1;
  }

  // ── Oportunidades ────────────────────────────────────────────────────────────
  for (const l of leads) {
    const name = str(l.name)!;
    const marca = str(l.marca)!;
    const linea = str(l.lineOfBusiness) ?? "GENERAL";
    const etapa = str(l.stage)!;
    const externalRef = str(l.externalRef)!;
    const stageId = stageById.get(stageKey(marca, linea, etapa))!;

    const dealType = (str(l.dealType) ?? "NEW_BUSINESS") as CrmDealType;

    // Al crear se escribe todo, incluidos los nulos. Al actualizar NO: que el fichero
    // omita un campo significa "no tengo dato", no "bórralo". Si alguien enlazó la
    // cuenta o ajustó el importe desde la UI, una segunda pasada no se lo lleva por
    // delante.
    const presentes = {
      ...(str(l.account) !== null ? { accountId: resolver(str(l.account)) } : {}),
      ...(str(l.dealType) !== null ? { dealType } : {}),
      ...(str(l.origin) !== null ? { origin: str(l.origin) as CrmLeadOrigin } : {}),
      ...(str(l.market) !== null ? { market: str(l.market) } : {}),
      ...(num(l.seats) !== null ? { seats: num(l.seats) } : {}),
      ...(num(l.amount) !== null ? { amount: num(l.amount) } : {}),
      ...(str(l.contactName) !== null ? { contactName: str(l.contactName) } : {}),
      ...(str(l.email) !== null ? { email: str(l.email) } : {}),
      ...(str(l.phone) !== null ? { phone: str(l.phone) } : {}),
      ...(str(l.notes) !== null ? { notes: str(l.notes) } : {}),
    };

    if (!APPLY) {
      console.log(`  ◆ ${name} · ${marca}/${linea} · ${etapa} · ${dealType}`);
      leadsNuevos += 1;
      continue;
    }

    // Idempotencia por (source, externalRef). No se escribe CrmLeadStageEvent: inventar
    // un cambio de etapa con la fecha de la carga ensuciaría el historial del que salen
    // el ciclo de venta y las conversiones. El KPI ya cae a createdAt cuando no hay
    // eventos.
    const previo = await prisma.crmLead.findUnique({
      where: { source_externalRef: { source: "MANUAL", externalRef } },
      select: { id: true },
    });

    let lead: { id: string };
    if (previo === null) {
      lead = await prisma.crmLead.create({
        data: { name, marca, lineOfBusiness: linea, stageId, externalRef, source: "MANUAL", dealType, ...presentes },
        select: { id: true },
      });
      leadsNuevos += 1;
    } else {
      lead = await prisma.crmLead.update({
        where: { id: previo.id },
        data: { name, marca, lineOfBusiness: linea, stageId, ...presentes },
        select: { id: true },
      });
      leadsActualizados += 1;
    }

    const contactos = Array.isArray(l.contacts) ? (l.contacts as LeadContactInput[]) : [];
    for (const c of contactos) {
      const email = str(c.email)!;
      const rol = (str(c.role) ?? "USUARIO") as CrmDecisionRole;
      // Por correo y en TODO el CRM, no solo en la cuenta del lead: el asesor externo
      // que decide trabaja en otra empresa.
      const contacto = await prisma.crmContact.findFirst({ where: { email } });
      if (contacto === null) {
        console.log(`      ⚠ ${name}: no hay ningún contacto con ${email}, se omite`);
        continue;
      }
      await prisma.crmLeadContact.upsert({
        where: { leadId_contactId: { leadId: lead.id, contactId: contacto.id } },
        update: { role: rol },
        create: { leadId: lead.id, contactId: contacto.id, role: rol },
      });
      personasEnLeads += 1;
    }
  }

  console.log(
    `\n${APPLY ? "Hecho" : "Se haría"}: ${creadas} cuentas nuevas · ${actualizadas} actualizadas · ` +
      `${contactosNuevos} contactos nuevos${contactosActualizados > 0 ? ` · ${contactosActualizados} actualizados` : ""}` +
      `${relations.length > 0 ? ` · ${relacionesNuevas} relaciones` : ""}` +
      `${leads.length > 0 ? ` · ${leadsNuevos} oportunidades nuevas${leadsActualizados > 0 ? ` · ${leadsActualizados} actualizadas` : ""}` : ""}` +
      `${personasEnLeads > 0 ? ` · ${personasEnLeads} personas en la decisión` : ""}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
