import { describe, expect, it } from "vitest";
import { semaforoLevel } from "./semaforo";

describe("semaforoLevel", () => {
  // Las metas del plan comercial: 10 leads/mes.
  it('"higher": verde al llegar, ámbar al 70 %, rojo por debajo', () => {
    expect(semaforoLevel(10, 10, "higher")).toBe("green");
    expect(semaforoLevel(12, 10, "higher")).toBe("green");
    expect(semaforoLevel(7, 10, "higher")).toBe("amber");
    expect(semaforoLevel(6.9, 10, "higher")).toBe("red");
  });

  // La meta de Holdmin: CPL ≈ 40 €. Gastar menos por lead es bueno.
  it('"lower": verde por debajo de la meta, ámbar hasta un 43 % por encima, rojo después', () => {
    expect(semaforoLevel(35, 40, "lower")).toBe("green");
    expect(semaforoLevel(40, 40, "lower")).toBe("green");
    expect(semaforoLevel(50, 40, "lower")).toBe("amber");
    expect(semaforoLevel(57, 40, "lower")).toBe("amber");
    expect(semaforoLevel(60, 40, "lower")).toBe("red");
  });

  it('"lower" con coste cero es verde, no una división por cero', () => {
    expect(semaforoLevel(0, 40, "lower")).toBe("green");
  });

  it("sin meta válida no juzga", () => {
    expect(semaforoLevel(5, 0, "higher")).toBeNull();
    expect(semaforoLevel(5, Number.NaN, "lower")).toBeNull();
    expect(semaforoLevel(-1, 10, "higher")).toBeNull();
  });
});
