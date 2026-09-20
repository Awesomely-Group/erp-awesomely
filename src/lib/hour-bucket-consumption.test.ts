import { describe, expect, it } from "vitest";
import {
  bucketStatus,
  computeBucketConsumption,
  type ConsumptionBucket,
  type ConsumptionWorklog,
} from "./hour-bucket-consumption";

function worklog(over: Partial<ConsumptionWorklog> = {}): ConsumptionWorklog {
  return {
    authorId: "ana",
    issueKey: "FIN-1",
    hours: 1,
    date: "2026-06-15",
    billable: true,
    approved: true,
    ...over,
  };
}

const SIN_FECHAS: ConsumptionBucket = { id: "b1", roleId: "backend", startDate: null, endDate: null };

describe("computeBucketConsumption", () => {
  it("reparte por el rol del autor cuando el issue no está asignado", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 3 })],
      buckets: [SIN_FECHAS],
      authorToRole: new Map([["ana", "backend"]]),
      issueToBucket: new Map(),
    });

    expect(res.hoursByBucketId.get("b1")).toBe(3);
    expect(res.pendingAttributionHours).toBe(0);
  });

  it("la asignación explícita del issue gana al rol del autor", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 2, issueKey: "FIN-9" })],
      buckets: [
        SIN_FECHAS,
        { id: "b2", roleId: "consultoria", startDate: null, endDate: null },
      ],
      authorToRole: new Map([["ana", "backend"]]),
      issueToBucket: new Map([["FIN-9", "b2"]]),
    });

    expect(res.hoursByBucketId.get("b2")).toBe(2);
    expect(res.hoursByBucketId.get("b1")).toBe(0);
  });

  // El bug que motivó la ventana: con caducidad de un año, renovar deja dos bolsas
  // activas del mismo rol. Antes el mapa rol→bolsa se quedaba con una y todo el
  // histórico caía en ella.
  it("reparte entre dos bolsas del mismo rol según la ventana de cada una", () => {
    const res = computeBucketConsumption({
      worklogs: [
        worklog({ hours: 5, date: "2025-03-10" }),
        worklog({ hours: 7, date: "2026-03-10" }),
      ],
      buckets: [
        { id: "vieja", roleId: "backend", startDate: "2025-01-01", endDate: "2025-12-31" },
        { id: "nueva", roleId: "backend", startDate: "2026-01-01", endDate: "2026-12-31" },
      ],
      authorToRole: new Map([["ana", "backend"]]),
      issueToBucket: new Map(),
    });

    expect(res.hoursByBucketId.get("vieja")).toBe(5);
    expect(res.hoursByBucketId.get("nueva")).toBe(7);
  });

  it("una bolsa sin fechas absorbe todo el histórico", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ date: "2020-01-01" }), worklog({ date: "2026-09-20" })],
      buckets: [SIN_FECHAS],
      authorToRole: new Map([["ana", "backend"]]),
      issueToBucket: new Map(),
    });

    expect(res.hoursByBucketId.get("b1")).toBe(2);
  });

  it("la asignación explícita no se filtra por fecha", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 4, date: "2030-01-01", issueKey: "FIN-9" })],
      buckets: [{ id: "b1", roleId: "backend", startDate: "2026-01-01", endDate: "2026-12-31" }],
      authorToRole: new Map(),
      issueToBucket: new Map([["FIN-9", "b1"]]),
    });

    expect(res.hoursByBucketId.get("b1")).toBe(4);
    expect(res.pendingAttributionHours).toBe(0);
  });

  describe("las tres fugas acaban en pendingAttributionHours y no en el limbo", () => {
    it("autor sin rol en el proyecto", () => {
      const res = computeBucketConsumption({
        worklogs: [worklog({ hours: 2, authorId: "desconocida", issueKey: null })],
        buckets: [SIN_FECHAS],
        authorToRole: new Map(),
        issueToBucket: new Map(),
      });

      expect(res.pendingAttributionHours).toBe(2);
      expect(res.unattributedByReason.get("NO_ROLE")).toBe(2);
      expect(res.unattributedByAuthor.get("desconocida")).toBe(2);
      expect(res.hoursByBucketId.get("b1")).toBe(0);
    });

    it("rol sin bolsa activa que cubra la fecha", () => {
      const res = computeBucketConsumption({
        worklogs: [worklog({ hours: 3, date: "2027-01-01" })],
        buckets: [{ id: "b1", roleId: "backend", startDate: "2026-01-01", endDate: "2026-12-31" }],
        authorToRole: new Map([["ana", "backend"]]),
        issueToBucket: new Map(),
      });

      expect(res.pendingAttributionHours).toBe(3);
      expect(res.unattributedByReason.get("ROLE_WITHOUT_BUCKET")).toBe(3);
      // No es culpa del autor: no debe salir en el aviso de "gente sin rol".
      expect(res.unattributedByAuthor.size).toBe(0);
    });

    it("issue asignado a una bolsa que ya no está activa", () => {
      const res = computeBucketConsumption({
        worklogs: [worklog({ hours: 1.5, issueKey: "FIN-9" })],
        buckets: [SIN_FECHAS],
        authorToRole: new Map([["ana", "backend"]]),
        issueToBucket: new Map([["FIN-9", "bolsa-inactiva"]]),
      });

      expect(res.pendingAttributionHours).toBe(1.5);
      expect(res.unattributedByReason.get("UNKNOWN_BUCKET")).toBe(1.5);
      // No cae al fallback por rol: la asignación explícita dice que esas horas NO son de b1.
      expect(res.hoursByBucketId.get("b1")).toBe(0);
    });
  });

  it("las horas no facturables ni consumen ni quedan pendientes", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 8, billable: false })],
      buckets: [SIN_FECHAS],
      authorToRole: new Map([["ana", "backend"]]),
      issueToBucket: new Map(),
    });

    expect(res.nonBillableHours).toBe(8);
    expect(res.hoursByBucketId.get("b1")).toBe(0);
    expect(res.pendingAttributionHours).toBe(0);
  });

  it("las horas sin aprobar se separan del saldo en vez de restarlo", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 6 }), worklog({ hours: 4, approved: false })],
      buckets: [SIN_FECHAS],
      authorToRole: new Map([["ana", "backend"]]),
      issueToBucket: new Map(),
    });

    expect(res.hoursByBucketId.get("b1")).toBe(6);
    expect(res.pendingApprovalByBucketId.get("b1")).toBe(4);
  });

  it("una hora no facturable no cuenta aunque esté sin aprobar", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 2, billable: false, approved: false })],
      buckets: [SIN_FECHAS],
      authorToRole: new Map([["ana", "backend"]]),
      issueToBucket: new Map(),
    });

    expect(res.nonBillableHours).toBe(2);
    expect(res.pendingApprovalByBucketId.get("b1")).toBe(0);
    expect(res.pendingAttributionHours).toBe(0);
  });

  it("toda bolsa aparece en el resultado aunque no tenga horas", () => {
    const res = computeBucketConsumption({
      worklogs: [],
      buckets: [SIN_FECHAS, { id: "b2", roleId: "consultoria", startDate: null, endDate: null }],
      authorToRole: new Map(),
      issueToBucket: new Map(),
    });

    expect([...res.hoursByBucketId.keys()]).toEqual(["b1", "b2"]);
    expect(res.hoursByBucketId.get("b2")).toBe(0);
  });
});

describe("bucketStatus", () => {
  const base = { totalHours: 100, alertThreshold: 0.8, endDate: null, today: "2026-09-20" };

  it("avisa justo al llegar al umbral, no después", () => {
    expect(bucketStatus({ ...base, consumedHours: 79.9 })).toBe("ACTIVE");
    expect(bucketStatus({ ...base, consumedHours: 80 })).toBe("NEAR_EXHAUSTION");
  });

  it("da por agotada al 100 %, no al pasarse", () => {
    expect(bucketStatus({ ...base, consumedHours: 99.9 })).toBe("NEAR_EXHAUSTION");
    expect(bucketStatus({ ...base, consumedHours: 100 })).toBe("EXHAUSTED");
    expect(bucketStatus({ ...base, consumedHours: 140 })).toBe("EXHAUSTED");
  });

  it("caducada gana a cualquier otro estado", () => {
    expect(bucketStatus({ ...base, consumedHours: 10, endDate: "2026-09-19" })).toBe("EXPIRED");
    // El último día todavía vale.
    expect(bucketStatus({ ...base, consumedHours: 10, endDate: "2026-09-20" })).toBe("ACTIVE");
  });

  it("una bolsa de 0 horas está sin configurar, no agotada", () => {
    expect(bucketStatus({ ...base, totalHours: 0, consumedHours: 0 })).toBe("ACTIVE");
  });
});
