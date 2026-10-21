import { describe, expect, it } from "vitest";
import { normalizeDealFields } from "./crm-deal-input";

describe("normalizeDealFields", () => {
  // Lo que hace que la edición sea parcial: tocar el importe no puede borrar las notas.
  it("solo devuelve los campos que venían en la entrada", () => {
    expect(normalizeDealFields({ amount: 1200 })).toEqual({ amount: 1200 });
    expect(normalizeDealFields({})).toEqual({});
  });

  it("distingue no tocar un campo de vaciarlo", () => {
    expect("origin" in normalizeDealFields({})).toBe(false);
    expect(normalizeDealFields({ origin: null })).toEqual({ origin: null });
  });

  it("rechaza el nombre vacío y recorta el que no lo está", () => {
    expect(() => normalizeDealFields({ name: "   " })).toThrow(/necesita un nombre/);
    expect(normalizeDealFields({ name: "  Odoo Moda re-  " })).toEqual({ name: "Odoo Moda re-" });
  });

  it("acepta importe nulo pero no negativo ni infinito", () => {
    expect(normalizeDealFields({ amount: null })).toEqual({ amount: null });
    expect(normalizeDealFields({ amount: 0 })).toEqual({ amount: 0 });
    expect(() => normalizeDealFields({ amount: -1 })).toThrow(/número ≥ 0/);
    expect(() => normalizeDealFields({ amount: Number.NaN })).toThrow(/número ≥ 0/);
  });

  // La probabilidad entra en el pipeline ponderado (src/lib/kpis/commercial.ts): un 150
  // o un 33,3 ahí dentro dan un dinero previsto que no significa nada.
  it("exige que la probabilidad sea un entero de 0 a 100", () => {
    expect(normalizeDealFields({ probability: 0 })).toEqual({ probability: 0 });
    expect(normalizeDealFields({ probability: 100 })).toEqual({ probability: 100 });
    expect(() => normalizeDealFields({ probability: 101 })).toThrow(/entre 0 y 100/);
    expect(() => normalizeDealFields({ probability: -1 })).toThrow(/entre 0 y 100/);
    expect(() => normalizeDealFields({ probability: 33.3 })).toThrow(/entre 0 y 100/);
  });

  it("convierte la fecha de cierre y trata el texto en blanco como sin fecha", () => {
    expect(normalizeDealFields({ expectedCloseDate: "2026-11-30" })).toEqual({
      expectedCloseDate: new Date("2026-11-30"),
    });
    expect(normalizeDealFields({ expectedCloseDate: "" })).toEqual({ expectedCloseDate: null });
    expect(normalizeDealFields({ expectedCloseDate: null })).toEqual({ expectedCloseDate: null });
    expect(() => normalizeDealFields({ expectedCloseDate: "30/11/2026" })).toThrow(/no es válida/);
  });

  it("exige que los seats sean un entero no negativo", () => {
    expect(normalizeDealFields({ seats: 75 })).toEqual({ seats: 75 });
    expect(() => normalizeDealFields({ seats: 7.5 })).toThrow(/entero ≥ 0/);
    expect(() => normalizeDealFields({ seats: -3 })).toThrow(/entero ≥ 0/);
  });

  // Un mercado " " y un mercado ausente tienen que leerse igual en la ficha: "—".
  it("guarda los textos en blanco como ausencia de dato", () => {
    expect(normalizeDealFields({ market: "   ", notes: "" })).toEqual({ market: null, notes: null });
    expect(normalizeDealFields({ market: "  España  " })).toEqual({ market: "España" });
  });
});
