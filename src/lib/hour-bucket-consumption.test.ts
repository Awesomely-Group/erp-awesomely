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

const SIN_FECHAS: ConsumptionBucket = { id: "b1", roleId: "backend", totalHours: 1000, startDate: null, endDate: null };

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
        { id: "b2", roleId: "consultoria", totalHours: 1000, startDate: null, endDate: null },
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
        { id: "vieja", roleId: "backend", totalHours: 1000, startDate: "2025-01-01", endDate: "2025-12-31" },
        { id: "nueva", roleId: "backend", totalHours: 1000, startDate: "2026-01-01", endDate: "2026-12-31" },
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
      buckets: [{ id: "b1", roleId: "backend", totalHours: 1000, startDate: "2026-01-01", endDate: "2026-12-31" }],
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
        buckets: [{ id: "b1", roleId: "backend", totalHours: 1000, startDate: "2026-01-01", endDate: "2026-12-31" }],
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
      buckets: [SIN_FECHAS, { id: "b2", roleId: "consultoria", totalHours: 1000, startDate: null, endDate: null }],
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

describe("varias bolsas del mismo rol se llenan por orden", () => {
  // El caso real de Colvin: nueve packs comprados seguidos, todos con ventana de un año,
  // así que casi todas las fechas caen dentro de varias. Antes la primera se lo llevaba
  // todo (65 h de bolsa con 198,5 consumidas) y el resto figuraban intactas.
  const packs: ConsumptionBucket[] = [
    { id: "dic", roleId: "backend", totalHours: 50, startDate: "2025-12-10", endDate: "2026-12-10" },
    { id: "ene", roleId: "backend", totalHours: 20, startDate: "2026-01-08", endDate: "2027-01-08" },
    { id: "feb", roleId: "backend", totalHours: 40, startDate: "2026-02-11", endDate: "2027-02-11" },
  ];
  const conRol = new Map([["ana", "backend"]]);

  it("agota la más antigua antes de tocar la siguiente", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 30, date: "2026-03-01", issueKey: null })],
      buckets: packs, authorToRole: conRol, issueToBucket: new Map(),
    });
    expect(res.hoursByBucketId.get("dic")).toBe(30);
    expect(res.hoursByBucketId.get("ene")).toBe(0);
  });

  it("desborda a la siguiente cuando una se llena", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 60, date: "2026-03-01", issueKey: null })],
      buckets: packs, authorToRole: conRol, issueToBucket: new Map(),
    });
    expect(res.hoursByBucketId.get("dic")).toBe(50);
    expect(res.hoursByBucketId.get("ene")).toBe(10);
    expect(res.hoursByBucketId.get("feb")).toBe(0);
  });

  it("lo que no cabe en ninguna sobrecarga la última, no se pierde", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 150, date: "2026-03-01", issueKey: null })],
      buckets: packs, authorToRole: conRol, issueToBucket: new Map(),
    });
    const total = [...res.hoursByBucketId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(150);
    expect(res.hoursByBucketId.get("feb")).toBe(80); // 40 suyas + 40 de exceso
  });

  it("reparte en orden cronológico, no en el orden en que llegan los partes", () => {
    const res = computeBucketConsumption({
      worklogs: [
        worklog({ hours: 40, date: "2026-06-01", issueKey: null }),
        worklog({ hours: 40, date: "2026-01-01", issueKey: null }),
      ],
      buckets: packs, authorToRole: conRol, issueToBucket: new Map(),
    });
    // El de enero es anterior y la única bolsa viva entonces es "dic": se sirve primero.
    expect(res.hoursByBucketId.get("dic")).toBe(50);
    expect(res.hoursByBucketId.get("ene")).toBe(20);
    expect(res.hoursByBucketId.get("feb")).toBe(10);
  });
});

describe("el exceso lo absorbe el pack siguiente", () => {
  const conRol = new Map([["ana", "backend"]]);

  it("una hora que no cabe en la bolsa viva cae en la que se compra después", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 25, date: "2025-10-28", issueKey: null })],
      buckets: [
        { id: "oct", roleId: "backend", totalHours: 10, startDate: "2025-10-27", endDate: "2026-10-27" },
        { id: "nov", roleId: "backend", totalHours: 20, startDate: "2025-11-03", endDate: "2026-11-03" },
      ],
      authorToRole: conRol, issueToBucket: new Map(),
    });
    // Sin arrastre, "oct" se comía las 25 h y "nov" quedaba a cero.
    expect(res.hoursByBucketId.get("oct")).toBe(10);
    expect(res.hoursByBucketId.get("nov")).toBe(15);
  });

  it("el trabajo anterior a que exista el pack lo cubre ese pack", () => {
    // Caso de Z1 Gestión: 31 de sus 37 h se imputaron antes de su propia bolsa, porque
    // se trabaja y luego se factura.
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 8, date: "2026-05-05", issueKey: null })],
      buckets: [{ id: "mayo", roleId: "backend", totalHours: 45, startDate: "2026-05-18", endDate: "2027-05-18" }],
      authorToRole: conRol, issueToBucket: new Map(),
    });
    expect(res.hoursByBucketId.get("mayo")).toBe(8);
    expect(res.pendingAttributionHours).toBe(0);
  });

  it("si no cabe en ninguna, sobrecarga la más reciente y no se pierde nada", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 100, date: "2025-10-28", issueKey: null })],
      buckets: [
        { id: "oct", roleId: "backend", totalHours: 10, startDate: "2025-10-27", endDate: "2026-10-27" },
        { id: "nov", roleId: "backend", totalHours: 20, startDate: "2025-11-03", endDate: "2026-11-03" },
      ],
      authorToRole: conRol, issueToBucket: new Map(),
    });
    expect(res.hoursByBucketId.get("oct")).toBe(10);
    expect(res.hoursByBucketId.get("nov")).toBe(90); // 20 suyas + 70 de exceso
    const total = [...res.hoursByBucketId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  it("sigue sin haber bolsa si el rol no tiene ninguna, ni viva ni futura", () => {
    const res = computeBucketConsumption({
      worklogs: [worklog({ hours: 4, date: "2026-01-01", issueKey: null })],
      buckets: [{ id: "otra", roleId: "devops", totalHours: 10, startDate: null, endDate: null }],
      authorToRole: conRol, issueToBucket: new Map(),
    });
    expect(res.pendingAttributionHours).toBe(4);
    expect(res.unattributedByReason.get("ROLE_WITHOUT_BUCKET")).toBe(4);
  });
});
