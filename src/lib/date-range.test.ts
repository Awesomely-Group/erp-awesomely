import { describe, expect, it } from "vitest";
import {
  getDateRange,
  getPreset,
  matchPreset,
  parseDateParam,
  resolvePeriodRange,
  serializePeriodRange,
  shiftRange,
  toDateParam,
} from "./date-range";

// Sábado 17 de octubre de 2026, media tarde.
const NOW = new Date(2026, 9, 17, 15, 30);

describe("presets", () => {
  it("mes actual cubre del 1 al último día del mes", () => {
    const r = getPreset("this_month")!.getRange(NOW);
    expect(toDateParam(r.from)).toBe("2026-10-01");
    expect(toDateParam(r.to)).toBe("2026-10-31");
    expect(r.to.getHours()).toBe(23);
  });

  it("trimestre anterior cruza de año cuando toca", () => {
    const r = getPreset("last_quarter")!.getRange(new Date(2026, 1, 10));
    expect(toDateParam(r.from)).toBe("2025-10-01");
    expect(toDateParam(r.to)).toBe("2025-12-31");
  });

  it("últimos N meses empieza el día 1 de (mes − N) y acaba a fin del mes en curso (E8)", () => {
    const r = getPreset("last_12_months")!.getRange(NOW);
    expect(toDateParam(r.from)).toBe("2025-10-01");
    expect(toDateParam(r.to)).toBe("2026-10-31");
  });

  it("últimos 7 días incluye hoy", () => {
    const r = getPreset("last_7_days")!.getRange(NOW);
    expect(toDateParam(r.from)).toBe("2026-10-11");
    expect(toDateParam(r.to)).toBe("2026-10-17");
  });
});

describe("parseDateParam / toDateParam", () => {
  it("parsea en hora local y rechaza fechas inválidas", () => {
    const d = parseDateParam("2026-10-01")!;
    expect(d.getHours()).toBe(0);
    expect(toDateParam(d)).toBe("2026-10-01");
    expect(parseDateParam("2026-02-30")).toBeNull();
    expect(parseDateParam("hoy")).toBeNull();
    expect(parseDateParam("")).toBeNull();
  });
});

describe("matchPreset / serializePeriodRange", () => {
  it("reconoce un rango que coincide con un preset", () => {
    expect(matchPreset(new Date(2026, 9, 1), new Date(2026, 9, 31, 12), NOW)).toBe("this_month");
    expect(matchPreset(new Date(2026, 8, 1), new Date(2026, 8, 30), NOW)).toBe("last_month");
  });

  it("serializa a preset cuando coincide y a custom cuando no", () => {
    expect(serializePeriodRange({ from: new Date(2026, 0, 1), to: new Date(2026, 11, 31) }, NOW))
      .toEqual({ period: "this_year", dateFrom: "", dateTo: "" });
    expect(serializePeriodRange({ from: new Date(2026, 9, 5), to: new Date(2026, 9, 20) }, NOW))
      .toEqual({ period: "custom", dateFrom: "2026-10-05", dateTo: "2026-10-20" });
    expect(serializePeriodRange(null, NOW)).toEqual({ period: "", dateFrom: "", dateTo: "" });
  });
});

describe("resolvePeriodRange", () => {
  it("devuelve null sin periodo ni fechas", () => {
    expect(resolvePeriodRange("", undefined, undefined, NOW)).toBeNull();
    expect(resolvePeriodRange(null, null, null, NOW)).toBeNull();
  });

  it("resuelve presets y rangos custom, ordenando si vienen al revés", () => {
    const preset = resolvePeriodRange("last_month", undefined, undefined, NOW)!;
    expect(toDateParam(preset.from)).toBe("2026-09-01");

    const custom = resolvePeriodRange("custom", "2026-10-20", "2026-10-05", NOW)!;
    expect(toDateParam(custom.from)).toBe("2026-10-05");
    expect(toDateParam(custom.to)).toBe("2026-10-20");
  });

  it("con una sola fecha usa el mismo día como inicio y fin", () => {
    const r = resolvePeriodRange("custom", "2026-10-05", undefined, NOW)!;
    expect(toDateParam(r.from)).toBe("2026-10-05");
    expect(toDateParam(r.to)).toBe("2026-10-05");
  });
});

describe("shiftRange", () => {
  it("mueve meses enteros por meses", () => {
    const oct = { from: new Date(2026, 9, 1), to: new Date(2026, 9, 31, 23, 59, 59, 999) };
    const prev = shiftRange(oct, -1);
    expect(toDateParam(prev.from)).toBe("2026-09-01");
    expect(toDateParam(prev.to)).toBe("2026-09-30");

    const q = { from: new Date(2026, 9, 1), to: new Date(2026, 11, 31) };
    const nextQ = shiftRange(q, 1);
    expect(toDateParam(nextQ.from)).toBe("2027-01-01");
    expect(toDateParam(nextQ.to)).toBe("2027-03-31");
  });

  it("mueve rangos sueltos por su número de días", () => {
    const r = { from: new Date(2026, 9, 5), to: new Date(2026, 9, 11) };
    const next = shiftRange(r, 1);
    expect(toDateParam(next.from)).toBe("2026-10-12");
    expect(toDateParam(next.to)).toBe("2026-10-18");
  });
});

describe("getDateRange", () => {
  it("convierte presets a gte/lte", () => {
    const r = getDateRange("this_year", undefined, undefined, NOW);
    expect(toDateParam(r.gte!)).toBe("2026-01-01");
    expect(toDateParam(r.lte!)).toBe("2026-12-31");
    expect(r.lte!.getHours()).toBe(23);
  });

  it("custom usa fin de día en lte y admite fechas sueltas sin period", () => {
    const r = getDateRange("custom", "2026-10-01", "2026-10-15", NOW);
    expect(r.gte!.getHours()).toBe(0);
    expect(r.lte!.getHours()).toBe(23);
    expect(getDateRange("", "2026-10-01", undefined, NOW).gte).toBeDefined();
    expect(getDateRange("", undefined, undefined, NOW)).toEqual({});
    expect(getDateRange("lo_que_sea", undefined, undefined, NOW)).toEqual({});
  });
});
