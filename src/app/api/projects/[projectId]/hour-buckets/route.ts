import { auth } from "@/lib/auth";
import { getProjectConsumption, type HoursSource } from "@/lib/hour-buckets";
import { JiraClient } from "@/lib/jira";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export interface HourBucketEntry {
  id: string;
  roleId: string;
  roleName: string;
  code: string | null;
  ratePerHour: number;
  totalHours: number;
  consumedHours: number;
  /** Imputadas a la bolsa con el parte aún sin aprobar. Solo llega con fuente Giro. */
  pendingApprovalHours: number;
  alertThreshold: number;
  startDate: string | null;
  endDate: string | null;
}

export interface UnassignedUser {
  accountId: string;
  displayName: string;
  hours: number;
}

export interface HourBucketsResponse {
  buckets: HourBucketEntry[];
  unassignedUsers: UnassignedUser[];
  /**
   * Horas facturables que no cayeron en ninguna bolsa, por cualquiera de los tres
   * motivos (autor sin rol, rol sin bolsa que cubra la fecha, o issue asignado a una
   * bolsa ya inactiva). Antes dos de esos tres casos desaparecían sin dejar rastro.
   */
  pendingAttributionHours: number;
  nonBillableHours: number;
  source: HoursSource;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;

  const consumption = await getProjectConsumption(projectId);
  if (consumption === null) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    buckets: consumption.buckets,
    unassignedUsers: await resolveUnassigned(projectId, consumption.unattributedByAuthor, consumption.source),
    pendingAttributionHours: consumption.pendingAttributionHours,
    nonBillableHours: consumption.nonBillableHours,
    source: consumption.source,
  } satisfies HourBucketsResponse);
}

/**
 * Pone nombre a quien imputó sin rol asignado.
 *
 * Ya no se recorta al periodo que se está viendo en pantalla: el aviso se calculaba
 * dentro de la ventana `from`/`to` mientras el consumo era de todo el histórico, así que
 * avisaba de menos horas de las que realmente faltaban por repartir. Ahora cubre lo
 * mismo que el saldo al que acompaña.
 */
async function resolveUnassigned(
  projectId: string,
  hoursByAuthor: Map<string, number>,
  source: HoursSource
): Promise<UnassignedUser[]> {
  if (hoursByAuthor.size === 0) return [];
  const authors = [...hoursByAuthor.keys()];

  // Con fuente Giro el autor ya ES el email, que es un nombre legible de por sí; ir a
  // Jira a resolverlo no llevaría a ninguna parte.
  let names = new Map<string, string>();
  if (source === "TEMPO") {
    const workspace = await prisma.jiraProject
      .findUnique({ where: { id: projectId }, select: { workspace: true } })
      .then((p) => p?.workspace ?? null);
    if (workspace !== null) {
      try {
        const jira = new JiraClient(workspace.domain, workspace.email, workspace.apiToken);
        names = await jira.getUsersByAccountIds(authors);
      } catch {
        // Sin nombre nos quedamos con el accountId: es feo, pero es peor perder el aviso.
      }
    }
  }

  return authors
    .map((accountId) => ({
      accountId,
      displayName: names.get(accountId) ?? accountId,
      hours: hoursByAuthor.get(accountId) ?? 0,
    }))
    .sort((a, b) => b.hours - a.hours);
}
