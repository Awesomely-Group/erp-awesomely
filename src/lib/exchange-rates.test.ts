import { describe, it, expect } from "vitest";
import { isWithinParityBand, PARITY_BAND_MAX, PARITY_BAND_MIN } from "./exchange-rates";

/**
 * La banda de paridad es lo que separa "Holded contabiliza sin convertir y el error es
 * asumible" de "el importe se va por un factor de 64". Los tipos usados aquí son reales
 * (BCE, 2025-2026) para que el test falle si alguien mueve la banda hasta dejar fuera a
 * GBP/USD — cuyo 1:1 está verificado contra el PyG de Holded — o dentro a PHP.
 */
describe("isWithinParityBand", () => {
  it("mantiene el 1:1 para las divisas verificadas contra el PyG de Holded", () => {
    expect(isWithinParityBand(1.1735)).toBe(true); // GBP→EUR
    expect(isWithinParityBand(0.9219)).toBe(true); // USD→EUR
  });

  it("deja fuera al peso filipino, que es el caso que rompía el dashboard", () => {
    expect(isWithinParityBand(0.01574)).toBe(false); // PHP→EUR, 30/04/2025
    expect(isWithinParityBand(0.01582)).toBe(false); // PHP→EUR, 30/05/2025
    expect(isWithinParityBand(0.01511)).toBe(false); // PHP→EUR, 30/06/2025
  });

  it("deja fuera divisas lejanas en el otro sentido", () => {
    expect(isWithinParityBand(28.5)).toBe(false); // KWD→EUR hipotético
  });

  it("incluye los extremos de la banda", () => {
    expect(isWithinParityBand(PARITY_BAND_MIN)).toBe(true);
    expect(isWithinParityBand(PARITY_BAND_MAX)).toBe(true);
    expect(isWithinParityBand(PARITY_BAND_MIN - 0.0001)).toBe(false);
    expect(isWithinParityBand(PARITY_BAND_MAX + 0.0001)).toBe(false);
  });
});
