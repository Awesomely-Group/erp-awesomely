import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { GiroClient } from "@/lib/giro-client";
import { canResolvePeopleFromGiro, type Persona } from "@/lib/hours-source";
import { JiraClient } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { TempoClient } from "@/lib/tempo";

/**
 * Personas, por nombre o por `accountId` de Jira (Bloque E).
 *
 * Sustituye a `/api/jira/users`, que eran cien líneas de rodeos para un problema que
 * Giro ya no tiene: **la búsqueda de Jira no devuelve a quien se ha ido**. Para suplirlo
 * había que barrer `/4/users` de Tempo (o, si eso fallaba, un año de worklogs), filtrar
 * los accountId desconocidos y resolver cada uno contra Jira de vuelta.
 *
 * El universo de `GET /api/v1/users` de Giro ya incluye a esa gente: quien firmó horas
 * está ahí aunque no tenga cuenta, como *shadow*. Una llamada y se acabó el rodeo — y
 * de propina sabemos **cuáles** son shadow, que es justo lo que hay que avisar antes del
 * cutover: esas personas no van a poder imputar.
 *
 * Mientras el dual-run dure, si no hay credenciales de Giro se cae a la ruta de antes.
 * Ese camino se borra con `TempoClient`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  const accountIds = (url.searchParams.get("accountIds") ?? url.searchParams.get("accountId") ?? "")
    .split(",")
    .map((valor) => valor.trim())
    .filter(Boolean);

  if (!query && accountIds.length === 0) {
    return NextResponse.json({ error: "Hace falta `query` o `accountIds`" }, { status: 400 });
  }

  const workspaces = await prisma.jiraWorkspace.findMany({ where: { active: true } });
  if (workspaces.length === 0) {
    return NextResponse.json({ error: "No hay ningún workspace configurado" }, { status: 404 });
  }

  if (canResolvePeopleFromGiro(workspaces)) {
    return NextResponse.json(await desdeGiro(workspaces, { query, accountIds }));
  }
  return NextResponse.json(await desdeJira(workspaces, { query, accountIds }));
}

type Workspace = { giroApiKey: string | null; domain: string; email: string; apiToken: string; tempoApiToken: string | null };

/** El camino nuevo: una llamada por workspace con clave de Giro. */
async function desdeGiro(
  workspaces: Workspace[],
  filtros: { query: string | null; accountIds: string[] },
): Promise<Persona[]> {
  const baseUrl = process.env.GIRO_BASE_URL!;
  const porAccountId = new Map<string, Persona>();

  for (const workspace of workspaces) {
    if (!workspace.giroApiKey) continue;

    const usuarios = await new GiroClient(baseUrl, workspace.giroApiKey).listUsers(
      filtros.accountIds.length > 0
        ? { accountIds: filtros.accountIds }
        : { q: filtros.query! },
    );

    for (const usuario of usuarios) {
      // Una persona puede tener más de un accountId (cuentas de Atlassian fusionadas):
      // se emite una entrada por cada uno, que es como la pide quien pinta un chip.
      for (const accountId of usuario.accountIds) {
        if (porAccountId.has(accountId)) continue;
        porAccountId.set(accountId, {
          accountId,
          displayName: usuario.name ?? usuario.email,
          // El email sombra (`shadow+<accountId>@migrated.giro.internal`) no es un
          // email de nadie: enseñarlo en la ficha sería ruido disfrazado de dato.
          emailAddress: usuario.isShadow ? "" : usuario.email,
          avatarUrl: null,
          active: usuario.active,
          isShadow: usuario.isShadow,
        });
      }
    }
  }

  return [...porAccountId.values()];
}

/**
 * El camino de antes, intacto: búsqueda en Jira más el barrido de Tempo para encontrar a
 * quien ya no aparece. Se mantiene solo mientras algún workspace no tenga Giro.
 */
async function desdeJira(
  workspaces: Workspace[],
  filtros: { query: string | null; accountIds: string[] },
): Promise<Persona[]> {
  const clients = workspaces.map((w) => new JiraClient(w.domain, w.email, w.apiToken));
  const conTempo = workspaces.find((w) => w.tempoApiToken);
  const tempo = conTempo?.tempoApiToken ? new TempoClient(conTempo.tempoApiToken) : undefined;

  if (filtros.accountIds.length > 0) {
    const salida: Persona[] = [];
    for (const accountId of filtros.accountIds) {
      for (const client of clients) {
        const nombres = await client.getUsersByAccountIds([accountId], tempo);
        const displayName = nombres.get(accountId);
        if (displayName) {
          salida.push({ accountId, displayName, emailAddress: "", avatarUrl: null, active: true });
          break;
        }
      }
    }
    return salida;
  }

  const q = filtros.query!.toLowerCase();
  const encontrados = await Promise.allSettled(clients.map((c) => c.searchUsers(filtros.query!)));
  const vistos = new Set<string>();
  const salida: Persona[] = [];

  for (const resultado of encontrados) {
    if (resultado.status !== "fulfilled") continue;
    for (const u of resultado.value) {
      if (vistos.has(u.accountId)) continue;
      vistos.add(u.accountId);
      salida.push({ ...u, avatarUrl: u.avatarUrl ?? null, active: u.active ?? true });
    }
  }

  // Quien se fue de Jira no sale en la búsqueda, pero sí imputó horas en Tempo.
  if (tempo) {
    try {
      let idsDeTempo: Set<string>;
      try {
        idsDeTempo = await tempo.getUserAccountIds();
      } catch {
        const haceUnAno = new Date();
        haceUnAno.setFullYear(haceUnAno.getFullYear() - 1);
        idsDeTempo = await tempo.getUniqueAuthorAccountIds(
          haceUnAno.toISOString().slice(0, 10),
          new Date().toISOString().slice(0, 10),
        );
      }

      const desconocidos = [...idsDeTempo].filter((id) => !vistos.has(id));
      const resueltos = await Promise.all(
        desconocidos.map(async (accountId) => {
          for (const client of clients) {
            const u = await client.getUserByAccountId(accountId);
            if (u) return u;
          }
          return null;
        }),
      );

      for (const u of resueltos) {
        if (!u || vistos.has(u.accountId)) continue;
        const casa = u.displayName.toLowerCase().includes(q) || u.emailAddress.toLowerCase().includes(q);
        if (casa) {
          vistos.add(u.accountId);
          salida.push({ ...u, avatarUrl: u.avatarUrl ?? null, active: u.active ?? true });
        }
      }
    } catch {
      // Si Tempo falla entero, se devuelve lo que dio Jira.
    }
  }

  return salida;
}
