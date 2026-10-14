import { describe, it, expect } from "vitest";
import { parseSyncLogDetails } from "./sync-log-details";

describe("parseSyncLogDetails", () => {
  it("devuelve null cuando la fila no tiene details", () => {
    expect(parseSyncLogDetails(null)).toBeNull();
    expect(parseSyncLogDetails(undefined)).toBeNull();
  });

  it("devuelve null cuando details no es un objeto", () => {
    expect(parseSyncLogDetails("{}")).toBeNull();
    expect(parseSyncLogDetails([1, 2])).toBeNull();
  });

  it("lee un sync de Holded completo", () => {
    const details = parseSyncLogDetails({
      mode: "incremental",
      fetchedIds: ["a", "b"],
      upsertErrors: [{ type: "invoice", holdedId: "a", docNumber: "F-1", error: "boom" }],
    });
    expect(details).toEqual({
      fetchedIds: ["a", "b"],
      upsertErrors: [{ type: "invoice", holdedId: "a", docNumber: "F-1", error: "boom" }],
      skipped: false,
      mode: "incremental",
    });
  });

  it("da listas vacías cuando el sync no trajo documentos ni errores", () => {
    // closeSyncLog omite fetchedIds y upsertErrors cuando están vacíos.
    const details = parseSyncLogDetails({ mode: "incremental", apiCalls: { total: 4 } });
    expect(details?.fetchedIds).toEqual([]);
    expect(details?.upsertErrors).toEqual([]);
    expect(details?.skipped).toBe(false);
  });

  it("reconoce la empresa que se quedó sin presupuesto de tiempo", () => {
    const details = parseSyncLogDetails({ mode: "incremental", skipped: true });
    expect(details).toEqual({
      fetchedIds: [],
      upsertErrors: [],
      skipped: true,
      mode: "incremental",
    });
  });

  it("ignora entradas con forma inesperada en vez de romper", () => {
    const details = parseSyncLogDetails({
      fetchedIds: ["a", 7, null],
      upsertErrors: ["nope", { holdedId: "b" }],
    });
    expect(details?.fetchedIds).toEqual(["a"]);
    expect(details?.upsertErrors).toEqual([
      { type: "", holdedId: "b", docNumber: "", error: "" },
    ]);
  });
});
