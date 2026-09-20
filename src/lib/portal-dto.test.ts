import { describe, expect, it } from "vitest";
import { isExpiringSoon, isStale, paymentStatus, proformaStatusLabel } from "./portal-dto";

describe("paymentStatus", () => {
  const base = { total: 1000, paidAmount: 0, dueDate: null, today: "2026-09-20" };

  it("cobrada del todo", () => {
    expect(paymentStatus({ ...base, paidAmount: 1000 })).toBe("PAID");
  });

  it("perdona un céntimo de redondeo de Holded", () => {
    expect(paymentStatus({ ...base, paidAmount: 999.995 })).toBe("PAID");
    expect(paymentStatus({ ...base, paidAmount: 999.5 })).not.toBe("PAID");
  });

  it("vencida gana a parcial: media factura vencida sigue estando vencida", () => {
    expect(paymentStatus({ ...base, paidAmount: 400, dueDate: "2026-09-19" })).toBe("OVERDUE");
    expect(paymentStatus({ ...base, paidAmount: 400, dueDate: "2026-10-30" })).toBe("PARTIAL");
  });

  it("el mismo día del vencimiento todavía no está vencida", () => {
    expect(paymentStatus({ ...base, dueDate: "2026-09-20" })).toBe("PENDING");
  });

  it("sin cobros ni vencimiento, pendiente", () => {
    expect(paymentStatus(base)).toBe("PENDING");
  });

  it("una factura cobrada y vencida está cobrada, no vencida", () => {
    expect(paymentStatus({ ...base, paidAmount: 1000, dueDate: "2020-01-01" })).toBe("PAID");
  });
});

describe("proformaStatusLabel", () => {
  it("distingue vencida de aprobada", () => {
    expect(proformaStatusLabel(4)).toBe("OVERDUE");
    expect(proformaStatusLabel(2)).toBe("APPROVED");
  });
});

describe("isStale", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("nunca calculado cuenta como viejo", () => {
    expect(isStale(null, 26, now)).toBe(true);
  });

  it("una pasada fallida no alarma, un día entero sí", () => {
    expect(isStale(new Date("2026-09-19T22:00:00Z"), 26, now)).toBe(false); // 14 h
    expect(isStale(new Date("2026-09-19T08:00:00Z"), 26, now)).toBe(true); // 28 h
  });
});

describe("isExpiringSoon", () => {
  const today = "2026-09-20";

  it("avisa dentro de los 30 días", () => {
    expect(isExpiringSoon("2026-10-10", today)).toBe(true);
    expect(isExpiringSoon("2026-10-20", today)).toBe(true); // justo el día 30
  });

  it("no avisa más allá de 30 días", () => {
    expect(isExpiringSoon("2026-10-21", today)).toBe(false);
  });

  it("una bolsa ya caducada no está 'a punto de caducar'", () => {
    expect(isExpiringSoon("2026-09-19", today)).toBe(false);
  });

  it("sin fecha de fin no hay nada que avisar", () => {
    expect(isExpiringSoon(null, today)).toBe(false);
  });
});
