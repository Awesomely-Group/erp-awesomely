import { describe, expect, it } from "vitest";
import {
  EMPTY_VALUE,
  formatCurrency,
  formatCurrencyRounded,
  formatHourlyRate,
  formatHours,
  formatMaybe,
  formatNumber,
  formatPercent,
  formatThousandsTick,
} from "./format";

// Intl separa el número de su unidad con espacio duro (U+00A0). Al menos un
// assert por helper fija el glifo real; el resto normaliza para que el diff de
// vitest sea legible.
const NBSP = "\u00A0";
const norm = (s: string): string => s.replace(/\u00A0/g, " ");

describe("formatCurrency", () => {
  it("usa el espacio duro que inserta Intl", () => {
    expect(formatCurrency(1234.5)).toBe(`1.234,50${NBSP}€`);
  });

  it("agrupa los miles también por debajo de 10.000", () => {
    // El default `useGrouping: "auto"` no agrupa en esta franja para es-ES,
    // que es la más frecuente del ERP.
    expect(norm(formatCurrency(999))).toBe("999,00 €");
    expect(norm(formatCurrency(1000))).toBe("1.000,00 €");
    expect(norm(formatCurrency(9999.99))).toBe("9.999,99 €");
    expect(norm(formatCurrency(10000))).toBe("10.000,00 €");
    expect(norm(formatCurrency(1234567.89))).toBe("1.234.567,89 €");
  });

  it("formatea cero y negativos", () => {
    expect(norm(formatCurrency(0))).toBe("0,00 €");
    expect(norm(formatCurrency(-1234.5))).toBe("-1.234,50 €");
  });

  it("no renderiza el cero negativo fantasma", () => {
    expect(norm(formatCurrency(-0.001))).toBe("0,00 €");
    expect(norm(formatCurrency(-0))).toBe("0,00 €");
  });

  it("redondea como Intl, no como toFixed", () => {
    // (1.005).toFixed(2) da "1.00" porque redondea sobre el binario; Intl
    // redondea sobre el decimal. Documentado porque el barrido migra ~20
    // sitios desde toFixed y alguno puede mover un céntimo.
    expect(norm(formatCurrency(1.005))).toBe("1,01 €");
  });

  it("respeta otras monedas", () => {
    expect(formatCurrency(1234.5, "USD")).toContain("1.234,50");
    expect(formatCurrency(1234.5, "GBP")).toContain("1.234,50");
  });
});

describe("formatCurrencyRounded", () => {
  it("quita los céntimos", () => {
    expect(norm(formatCurrencyRounded(1234.5))).toBe("1.235 €");
    expect(norm(formatCurrencyRounded(999.4))).toBe("999 €");
  });

  it("no renderiza el cero negativo fantasma", () => {
    expect(norm(formatCurrencyRounded(-0.4))).toBe("0 €");
  });
});

describe("formatHourlyRate", () => {
  it("siempre lleva dos decimales", () => {
    expect(formatHourlyRate(45)).toBe(`45,00${NBSP}€/h`);
    expect(norm(formatHourlyRate(35.456))).toBe("35,46 €/h");
  });
});

describe("formatHours", () => {
  it("omite el decimal cuando no aporta", () => {
    expect(formatHours(40)).toBe(`40${NBSP}h`);
    expect(norm(formatHours(0))).toBe("0 h");
  });

  it("conserva un decimal en los agregados", () => {
    expect(norm(formatHours(12.53))).toBe("12,5 h");
  });

  it("agrupa los miles", () => {
    expect(norm(formatHours(1234))).toBe("1.234 h");
  });

  it("acepta decimales explícitos", () => {
    expect(norm(formatHours(8, { decimals: 1 }))).toBe("8,0 h");
  });

  it("formatea negativos", () => {
    expect(norm(formatHours(-3.5))).toBe("-3,5 h");
  });
});

describe("formatPercent", () => {
  it("recibe el valor ya multiplicado por 100", () => {
    expect(formatPercent(12.34)).toBe(`12,3${NBSP}%`);
  });

  it("acepta otros decimales", () => {
    expect(norm(formatPercent(12.34, { decimals: 0 }))).toBe("12 %");
  });

  it("fuerza el signo en desviaciones, salvo en el cero", () => {
    expect(norm(formatPercent(2.4, { signed: true }))).toBe("+2,4 %");
    expect(norm(formatPercent(-2.4, { signed: true }))).toBe("-2,4 %");
    expect(norm(formatPercent(0, { signed: true }))).toBe("0,0 %");
  });

  it("expresa puntos porcentuales", () => {
    expect(norm(formatPercent(2.4, { signed: true, unit: "pp" }))).toBe(
      "+2,4 pp",
    );
  });
});

describe("formatNumber", () => {
  it("agrupa los miles y no pone decimales por defecto", () => {
    expect(formatNumber(1234)).toBe("1.234");
    expect(formatNumber(1234.6)).toBe("1.235");
  });

  it("acepta decimales explícitos, como el tipo de cambio", () => {
    expect(norm(formatNumber(1.0847, { decimals: 4 }))).toBe("1,0847");
  });
});

describe("formatThousandsTick", () => {
  it("conserva la semántica del tick anterior", () => {
    expect(formatThousandsTick(120000)).toBe("120k");
    expect(formatThousandsTick(1500)).toBe("2k");
    expect(formatThousandsTick(0)).toBe("0k");
    expect(formatThousandsTick(-500)).toBe("-1k");
  });

  it("no renderiza -0k", () => {
    expect(formatThousandsTick(-200)).toBe("0k");
  });
});

describe("formatMaybe", () => {
  it("devuelve el glifo vacío para null y undefined", () => {
    expect(formatMaybe(null, formatCurrency)).toBe(EMPTY_VALUE);
    expect(formatMaybe(undefined, formatCurrency)).toBe(EMPTY_VALUE);
  });

  it("acepta un fallback propio", () => {
    expect(formatMaybe(null, formatHourlyRate, "no configurada")).toBe(
      "no configurada",
    );
  });

  it("formatea el cero en vez de tratarlo como ausente", () => {
    // Impide que se reimplemente con `||` en lugar de una comprobación de nulo.
    expect(norm(formatMaybe(0, formatCurrency))).toBe("0,00 €");
  });
});
