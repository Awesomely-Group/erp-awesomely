/**
 * Los dos cortes de horas de un proyecto (Bloque E, 3/3).
 *
 * La fuente (`projectWorklogs`) se mockea a propósito: lo que hay que fijar aquí no es
 * de dónde salen las horas —eso ya lo decide y prueba `hours-source`— sino la
 * aritmética que la ruta hace encima, que es donde un cambio aparentemente inocente
 * mueve un número que alguien está mirando para facturar.
 *
 * Tres decisiones que se rompen solas si nadie las sujeta:
 *
 * - **La estimación se cuenta una vez por issue**, aunque hayan imputado tres personas.
 *   Sumarla por fila triplicaría el presupuesto del proyecto.
 * - **El coste sale de las tarifas del ERP**, en el orden proyecto → rol del proveedor →
 *   tarifa suelta del proveedor → 0. Sin tarifa es 0 €, y ese 0 tiene que verse.
 * - **Una persona sin tarifa no desaparece**: sus horas siguen en el total.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    jiraProject: { findUnique: vi.fn() },
    supplier: { findMany: vi.fn() },
    projectUserRole: { findMany: vi.fn() },
    issueHourBucketAssignment: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/hours-source", () => ({ projectWorklogs: vi.fn() }));

const { auth } = await import("@/lib/auth");
const { prisma } = await import("@/lib/prisma");
const { projectWorklogs } = await import("@/lib/hours-source");
const { GET } = await import("@/app/api/projects/[projectId]/hours/route");

const VICTOR = "712020:victor";
const JAUME = "557058:jaume";

function linea(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    accountId: VICTOR,
    issueKey: "FIN-1",
    issueNumericId: null,
    description: "",
    seconds: 3600,
    date: "2026-10-01",
    ...overrides,
  };
}

async function pide(groupBy: string) {
  const request = new Request(
    `http://localhost/api/projects/p1/hours?from=2026-10-01&to=2026-10-31&groupBy=${groupBy}`,
  );
  const res = await GET(request, { params: Promise.resolve({ projectId: "p1" }) });
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue({ user: { email: "jaume@somosgigson.com" } } as never);
  vi.mocked(prisma.jiraProject.findUnique).mockResolvedValue({
    id: "p1",
    jiraId: "10001",
    giroProjectId: "g1",
    workspace: {},
  } as never);
  vi.mocked(prisma.supplier.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.projectUserRole.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.issueHourBucketAssignment.findMany).mockResolvedValue([] as never);
});

describe("GET /api/projects/[projectId]/hours", () => {
  it("rechaza un groupBy que ya no existe en vez de servir otro corte", async () => {
    vi.mocked(projectWorklogs).mockResolvedValue({
      source: "GIRO",
      worklogs: [],
      issues: new Map(),
      nombres: new Map(),
      sinPuente: [],
    });

    const { status } = await pide("worklog");

    expect(status).toBe(400);
  });

  it("month-cost valora cada hora con la tarifa de quien la imputó", async () => {
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([
      { jiraUsers: [{ accountId: VICTOR }], hourlyRate: 50, defaultRole: null },
    ] as never);
    vi.mocked(prisma.projectUserRole.findMany).mockResolvedValue([
      { jiraAccountId: JAUME, ratePerHour: 80 },
    ] as never);
    vi.mocked(projectWorklogs).mockResolvedValue({
      source: "GIRO",
      worklogs: [
        linea({ seconds: 7200, date: "2026-09-01" }),
        linea({ seconds: 10800, issueKey: "FIN-2" }),
        linea({ accountId: JAUME, seconds: 5400 }),
      ],
      issues: new Map([
        ["FIN-1", { summary: "Integración", originalEstimateSeconds: 18000 }],
        ["FIN-2", { summary: "Conciliación", originalEstimateSeconds: 10800 }],
      ]),
      nombres: new Map(),
      sinPuente: [],
    });

    const { body } = await pide("month-cost");

    expect(body.months).toEqual([
      { month: "2026-09", totalHours: 2, totalCost: 100 },
      { month: "2026-10", totalHours: 4.5, totalCost: 270 },
    ]);
    expect(body.totalCost).toBe(370);
    // 5h + 3h de estimación, valoradas a la tarifa media real del periodo (370/6,5).
    expect(body.estimateHours).toBe(8);
    expect(body.estimateCost).toBe(455.38);
  });

  it("la tarifa del proyecto gana a la del proveedor", async () => {
    vi.mocked(prisma.supplier.findMany).mockResolvedValue([
      { jiraUsers: [{ accountId: VICTOR }], hourlyRate: 50, defaultRole: { ratePerHour: 60 } },
    ] as never);
    vi.mocked(prisma.projectUserRole.findMany).mockResolvedValue([
      { jiraAccountId: VICTOR, ratePerHour: 90 },
    ] as never);
    vi.mocked(projectWorklogs).mockResolvedValue({
      source: "GIRO",
      worklogs: [linea({ seconds: 3600 })],
      issues: new Map(),
      nombres: new Map(),
      sinPuente: [],
    });

    const { body } = await pide("month-cost");

    expect(body.totalCost).toBe(90);
  });

  it("sin ninguna tarifa el coste es 0 y las horas siguen contando", async () => {
    vi.mocked(projectWorklogs).mockResolvedValue({
      source: "GIRO",
      worklogs: [linea({ seconds: 5400 })],
      issues: new Map(),
      nombres: new Map(),
      sinPuente: ["Jaume Torres"],
    });

    const { body } = await pide("hierarchical");

    expect(body.totalHours).toBe(1.5);
    expect(body.totalActualCostEur).toBe(0);
    expect(body.sinPuente).toEqual(["Jaume Torres"]);
  });

  it("la estimación de un issue se cuenta una vez, no una por persona", async () => {
    vi.mocked(projectWorklogs).mockResolvedValue({
      source: "GIRO",
      // Las dos personas imputan sobre el MISMO issue, estimado en 5h.
      worklogs: [linea(), linea({ accountId: JAUME })],
      issues: new Map([["FIN-1", { summary: "Integración", originalEstimateSeconds: 18000 }]]),
      nombres: new Map(),
      sinPuente: [],
    });

    const { body } = await pide("hierarchical");

    expect(body.totalEstimateHours).toBe(5);
  });

  it("hierarchical ordena por horas descendentes y anida persona → issue → worklog", async () => {
    vi.mocked(prisma.projectUserRole.findMany).mockResolvedValue([
      { jiraAccountId: JAUME, ratePerHour: 80 },
    ] as never);
    vi.mocked(projectWorklogs).mockResolvedValue({
      source: "GIRO",
      worklogs: [
        linea({ accountId: JAUME, seconds: 3600, description: "Revisión" }),
        linea({ accountId: JAUME, seconds: 1800, description: "Más revisión" }),
        linea({ seconds: 900 }),
      ],
      issues: new Map([["FIN-1", { summary: "Integración", originalEstimateSeconds: null }]]),
      nombres: new Map([[JAUME, "Jaume Torres"]]),
      sinPuente: [],
    });

    const { body } = await pide("hierarchical");

    expect(body.users.map((u: { accountId: string }) => u.accountId)).toEqual([JAUME, VICTOR]);
    expect(body.users[0].displayName).toBe("Jaume Torres");
    expect(body.users[0].issues[0].worklogs).toHaveLength(2);
    expect(body.users[0].actualCostEur).toBe(120);
    // Sin nombre resuelto se cae al accountId, nunca a una fila en blanco.
    expect(body.users[1].displayName).toBe(VICTOR);
    // Un worklog sin descripción se pinta con una raya, no vacío.
    expect(body.users[1].issues[0].worklogs[0].description).toBe("—");
  });

  it("un proyecto sin fuente devuelve UNAVAILABLE, no un cero que parece un dato", async () => {
    vi.mocked(projectWorklogs).mockResolvedValue({
      source: "UNAVAILABLE",
      worklogs: [],
      issues: new Map(),
      nombres: new Map(),
      sinPuente: [],
    });

    const { body } = await pide("month-cost");

    expect(body.source).toBe("UNAVAILABLE");
    expect(body.months).toEqual([]);
  });
});
