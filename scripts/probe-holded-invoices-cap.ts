/**
 * Sonda empírica de los listados de documentos de la API v2 de Holded.
 *
 * Nació para contestar a una suposición del sync: `/invoices` se pedía con una
 * sola llamada y `limit=5000` con el comentario "no hard cap observed". Si eso
 * fuera falso, el sync leería una lista truncada como "el resto ya no existe en
 * Holded" y borraría facturas que sí están.
 *
 * Lo que mide (resultados del 17-09-2026 en el README de la tarea):
 *   · la respuesta es `{ items, cursor, has_more }`, no un array plano;
 *   · el tope es de 200 por respuesta, se pida el `limit` que se pida;
 *   · `offset` y `page` se ignoran; solo avanza el `cursor` ("page:2", …);
 *   · `start_date`/`end_date` funcionan también en `/invoices` y conviven con el
 *     cursor.
 *
 * Solo lee: no escribe ni en Holded ni en la base de datos.
 *
 * Ejecutar con:
 *   npx tsx --env-file=.env scripts/probe-holded-invoices-cap.ts --stage=<etapa>
 *
 * Etapas:
 *   db       (por defecto) cuántos documentos hay en la BD. No gasta API.
 *   api      tope y parámetros aceptados por /invoices y /purchases.
 *   cursor   comprueba que el cursor devuelto avanza de verdad.
 *   deep     barrido con cursor contra la llamada única, y cursor + ventanas.
 *   cliente  extremo a extremo con HoldedClient: cuenta documentos, marca de
 *            completo y llamadas consumidas. Requiere HOLDED_API_VERSION=v2.
 */

import { PrismaClient } from "@prisma/client";
import { HoldedClient, createHoldedApiStats } from "../src/lib/holded";
import { PrismaNeon } from "@prisma/adapter-neon";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const BASE = "https://api.holded.com/api/v2";

let apiCalls = 0;

interface Probe {
  label: string;
  status: number;
  count: number;
  shape: string;
  topLevelKeys?: string[];
  firstId?: string | null;
  lastId?: string | null;
  cursor?: unknown;
  hasMore?: unknown;
  ids?: string[];
  dates?: string[];
  errorBody?: string;
}

async function probe(
  apiKey: string,
  path: string,
  params: Record<string, string>,
  label: string,
): Promise<Probe> {
  apiCalls++;
  const url = new URL(`${BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const text = await res.text();
  if (!res.ok) {
    return {
      label,
      status: res.status,
      count: -1,
      shape: "error",
      errorBody: text.slice(0, 300),
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { label, status: res.status, count: -1, shape: "not-json", errorBody: text.slice(0, 300) };
  }

  if (Array.isArray(parsed)) {
    const arr = parsed as Array<{ id?: string; date?: string }>;
    return {
      label,
      status: res.status,
      count: arr.length,
      shape: "array",
      ids: arr.map((x) => x.id ?? ""),
      dates: arr.map((x) => (x as { date?: string }).date ?? "?"),
      firstId: arr[0]?.id ?? null,
      lastId: arr[arr.length - 1]?.id ?? null,
    };
  }

  const obj = parsed as Record<string, unknown>;
  const items = Array.isArray(obj.items)
    ? (obj.items as Array<{ id?: string; date?: string }>)
    : null;
  return {
    label,
    status: res.status,
    count: items ? items.length : -1,
    shape: items ? "object{items}" : "object",
    topLevelKeys: Object.keys(obj),
    firstId: items?.[0]?.id ?? null,
    lastId: items ? (items[items.length - 1]?.id ?? null) : null,
    cursor: obj.cursor,
    hasMore: obj.has_more,
    ids: items?.map((x) => x.id ?? ""),
    dates: items?.map((x) => (x as { date?: string }).date ?? "?"),
  };
}

function line(p: Probe): string {
  const parts = [
    p.label.padEnd(38),
    `HTTP ${p.status}`,
    `n=${String(p.count).padStart(5)}`,
    p.shape,
  ];
  if (p.topLevelKeys) parts.push(`keys=[${p.topLevelKeys.join(",")}]`);
  if (p.cursor !== undefined) parts.push(`cursor=${JSON.stringify(p.cursor)}`);
  if (p.hasMore !== undefined) parts.push(`has_more=${JSON.stringify(p.hasMore)}`);
  if (p.firstId) parts.push(`first=${p.firstId.slice(0, 8)}`);
  if (p.lastId) parts.push(`last=${p.lastId.slice(0, 8)}`);
  if (p.errorBody) parts.push(`body=${p.errorBody}`);
  return parts.join("  ");
}

async function main(): Promise<void> {
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1] ?? "db";

  const companies = await prisma.company.findMany({
    where: { active: true },
    select: { id: true, name: true, holdedApiKey: true },
  });

  for (const c of companies) {
    const sales = await prisma.invoice.count({ where: { companyId: c.id, type: "SALE" } });
    const purchases = await prisma.invoice.count({ where: { companyId: c.id, type: "PURCHASE" } });
    const oldest = await prisma.invoice.findFirst({
      where: { companyId: c.id, type: "SALE" },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    const newest = await prisma.invoice.findFirst({
      where: { companyId: c.id, type: "SALE" },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    console.log(
      `\n=== ${c.name} === BD: ventas=${sales} compras=${purchases} ` +
        `rango ventas=${oldest?.date.toISOString().slice(0, 10) ?? "-"}..${newest?.date.toISOString().slice(0, 10) ?? "-"}`,
    );

    if (stage === "orden") {
      // ¿Se puede pedir orden ascendente? Con la lista ordenada de antiguo a
      // nuevo, un documento creado a mitad de barrido se añade al final y no
      // desplaza las páginas ya leídas: la paginación por offset deja de poder
      // saltarse documentos.
      const base = await probe(c.holdedApiKey, "/purchases", { limit: "3" }, "sin orden");
      console.log("  " + line(base));
      const baseFirst = base.ids?.[0];

      console.log(`    fechas sin orden: ${base.dates?.join(", ")}`);

      for (const params of [
        { sort: "asc" },
        { sort: "date_asc" },
        { sort: "desc" },
        { sort: "chorizo" },
      ]) {
        const r = await probe(
          c.holdedApiKey,
          "/purchases",
          { limit: "3", ...params },
          Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&"),
        );
        console.log(
          `    ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join("&").padEnd(18)} ` +
            `fechas: ${r.dates?.join(", ")}  ¿cambia el primero? ${r.ids?.[0] !== baseFirst}`,
        );
      }
      continue;
    }

    if (stage === "huerfanas") {
      // Qué haría la reconciliación de borrados con el barrido nuevo: qué
      // facturas de la BD no aparecen en el listado y por qué. Solo lee.
      const stats = createHoldedApiStats();
      const client = new HoldedClient(c.holdedApiKey, stats);
      const [ventas, compras] = await Promise.all([
        client.getAllInvoicesPaginated("invoice"),
        client.getAllInvoicesPaginated("purchase"),
      ]);
      if (!ventas.complete || !compras.complete) {
        console.log("  listado incompleto, la reconciliación se saltaría");
        continue;
      }

      const enHolded = new Set([
        ...ventas.documents.map((d) => d.id),
        ...compras.documents.map((d) => d.id),
      ]);
      const enBd = await prisma.invoice.findMany({
        where: { companyId: c.id },
        select: {
          holdedId: true,
          type: true,
          number: true,
          date: true,
          removedFromHoldedAt: true,
        },
        orderBy: { date: "asc" },
      });

      const huerfanas = enBd.filter((i) => !enHolded.has(i.holdedId));
      console.log(
        `  en Holded=${enHolded.size}  en BD=${enBd.length}  no aparecen en el listado=${huerfanas.length}`,
      );
      for (const h of huerfanas) {
        console.log(
          `    ${h.type.padEnd(8)} ${h.date.toISOString().slice(0, 10)}  ${(h.number ?? "—").padEnd(18)}` +
            `  ya marcada como eliminada: ${h.removedFromHoldedAt ? "sí" : "NO"}`,
        );
      }
      apiCalls += stats.total;
      continue;
    }

    if (stage === "cliente") {
      // Comprobación de extremo a extremo del cliente real (no de la API suelta):
      // que el barrido con cursor devuelve lo mismo que devolvía la llamada única
      // y que reporta el listado como completo. Solo lee.
      const stats = createHoldedApiStats();
      const client = new HoldedClient(c.holdedApiKey, stats);
      // --full simula el sync completo del domingo (desde HOLDED_SYNC_FROM_YEAR).
      const completo = process.argv.includes("--full");
      const desde = completo ? undefined : new Date(2026, 0, 1);

      const [ventas, compras, proformas] = await Promise.all([
        client.getAllInvoicesPaginated("invoice"),
        client.getAllInvoicesPaginated("purchase", { fromDate: desde }),
        client.getAllProformasPaginated(),
      ]);

      for (const [label, r] of [
        ["ventas (toda la historia)", ventas],
        [`compras (${completo ? "ámbito completo" : "desde 2026-01-01"})`, compras],
        ["proformas", proformas],
      ] as Array<[string, { documents: unknown[]; complete: boolean; incompleteReason?: string }]>) {
        console.log(
          `  ${label.padEnd(28)} n=${String(r.documents.length).padStart(5)}  completo=${r.complete}` +
            (r.incompleteReason ? `  motivo=${r.incompleteReason}` : ""),
        );
      }
      console.log(`  llamadas: ${stats.total} → ${JSON.stringify(stats.byEndpoint)}`);
      apiCalls += stats.total;
      continue;
    }

    if (stage === "deep") {
      // A) ¿Un barrido con cursor devuelve exactamente lo mismo que la llamada
      //    única de hoy (limit=5000)? Si no, la paginación pierde documentos.
      const single = await probe(c.holdedApiKey, "/invoices", { limit: "5000" }, "/invoices limit=5000");
      console.log("  " + line(single));
      const singleIds = new Set(single.ids ?? []);

      const sweptIds = new Set<string>();
      let cursor: string | undefined;
      let pages = 0;
      for (;;) {
        pages++;
        const params: Record<string, string> = { limit: "200" };
        if (cursor) params.cursor = cursor;
        const r = await probe(c.holdedApiKey, "/invoices", params, `/invoices barrido pág.${pages}`);
        console.log("  " + line(r));
        (r.ids ?? []).forEach((id) => sweptIds.add(id));
        cursor = r.hasMore === true && typeof r.cursor === "string" ? r.cursor : undefined;
        if (!cursor || pages >= 20) break;
      }
      const soloSingle = [...singleIds].filter((id) => !sweptIds.has(id));
      const soloSwept = [...sweptIds].filter((id) => !singleIds.has(id));
      console.log(
        `  → barrido: ${sweptIds.size} ids en ${pages} páginas vs ${singleIds.size} de la llamada única; ` +
          `solo en única=${soloSingle.length} solo en barrido=${soloSwept.length}`,
      );

      // B) ¿El cursor convive con start_date/end_date? Es lo que harán las
      //    ventanas mensuales de /purchases al paginar.
      const win = { start_date: "2026-01-01", end_date: "2026-12-31" };
      const full = await probe(c.holdedApiKey, "/purchases", { ...win, limit: "200" }, "/purchases 2026 limit=200");
      console.log("  " + line(full));
      const winIds = new Set<string>();
      let c2: string | undefined;
      let p2 = 0;
      for (;;) {
        p2++;
        const params: Record<string, string> = { ...win, limit: "5" };
        if (c2) params.cursor = c2;
        const r = await probe(c.holdedApiKey, "/purchases", params, `/purchases 2026 pág.${p2}`);
        console.log("  " + line(r));
        (r.ids ?? []).forEach((id) => winIds.add(id));
        c2 = r.hasMore === true && typeof r.cursor === "string" ? r.cursor : undefined;
        if (!c2 || p2 >= 4) break;
      }
      const fullIds = new Set(full.ids ?? []);
      const fuera = [...winIds].filter((id) => !fullIds.has(id));
      console.log(
        `  → ventana 2026: ${winIds.size} ids en ${p2} páginas de 5, todos dentro de la ventana de 200: ${fuera.length === 0}`,
      );
      continue;
    }

    if (stage === "cursor") {
      // ¿El cursor devuelto avanza de verdad? Se siguen 3 páginas de 5 y se
      // comprueba que los ids no se repiten (offset/page sí se ignoran).
      for (const path of ["/invoices", "/purchases"]) {
        const seen = new Set<string>();
        let cursor: string | undefined;
        let page = 0;
        let dup = 0;
        for (;;) {
          page++;
          const params: Record<string, string> = { limit: "5" };
          if (cursor) params.cursor = cursor;
          const r = await probe(c.holdedApiKey, path, params, `${path} pág.${page} cursor=${cursor ?? "(none)"}`);
          console.log("  " + line(r));
          const ids = r.ids ?? [];
          for (const id of ids) {
            if (seen.has(id)) dup++;
            seen.add(id);
          }
          cursor = r.hasMore === true && typeof r.cursor === "string" ? r.cursor : undefined;
          if (!cursor || page >= 3) break;
        }
        console.log(`  → ${path}: ${seen.size} ids únicos en ${page} páginas, ${dup} repetidos\n`);
      }
      continue;
    }

    if (stage !== "api") continue;

    const p = (params: Record<string, string>, label: string, path = "/invoices") =>
      probe(c.holdedApiKey, path, params, label).then((r) => console.log("  " + line(r)));

    // ── 1. ¿Se respeta `limit`? ¿Hay tope duro en /invoices? ───────────────────
    await p({ limit: "5" }, "/invoices limit=5");
    await p({ limit: "100" }, "/invoices limit=100");
    await p({ limit: "5000" }, "/invoices limit=5000");
    await p({}, "/invoices sin params");

    // ── 2. ¿Hay offset/page/cursor que muevan la ventana? ──────────────────────
    await p({ limit: "5", offset: "5" }, "/invoices limit=5&offset=5");
    await p({ limit: "5", page: "2" }, "/invoices limit=5&page=2");
    await p({ limit: "5", cursor: "0" }, "/invoices limit=5&cursor=0");

    // ── 3. ¿Acepta ventanas de fecha como /purchases? ──────────────────────────
    // Un año sin ventas debe devolver ~0 si el filtro se aplica; el total si se ignora.
    await p({ limit: "500", start_date: "2026-01-01", end_date: "2026-12-31" }, "/invoices fechas 2026");
    await p({ limit: "500", start_date: "2020-01-01", end_date: "2020-12-31" }, "/invoices fechas 2020");

    // ── 4. Control: /purchases sí tiene tope conocido. Sirve para medir el tope
    //      real de los endpoints de documentos de v2 sobre un conjunto grande. ──
    await p({ limit: "100" }, "/purchases limit=100", "/purchases");
    await p({ limit: "250" }, "/purchases limit=250", "/purchases");
    await p({ limit: "5000" }, "/purchases limit=5000", "/purchases");
  }

  console.log(`\nLlamadas a la API de Holded consumidas por esta sonda: ${apiCalls}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
