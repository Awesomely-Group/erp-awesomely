import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SYNC_DEADLINE_MARGIN_MS,
  SYNC_MAX_DURATION_SECONDS,
  SYNC_STALE_AFTER_MS,
  syncDeadline,
  syncStaleCutoff,
} from "./sync-timing";

/** Toda ruta que lance un syncAll entero tiene que declarar el mismo presupuesto. */
const SYNC_ROUTES = [
  "src/app/api/sync/route.ts",
  "src/app/api/sync/stream/route.ts",
  "src/app/api/webhooks/holded/route.ts",
];

describe("sync-timing", () => {
  it("da por muerta una ejecución vieja y no una reciente", () => {
    const now = new Date("2026-09-18T12:00:00Z");
    const cutoff = syncStaleCutoff(now).getTime();

    expect(new Date("2026-09-18T11:40:00Z").getTime()).toBeLessThan(cutoff); // hace 20 min
    expect(new Date("2026-09-18T11:55:00Z").getTime()).toBeGreaterThan(cutoff); // hace 5 min
  });

  it("la ventana de muerte supera el tiempo máximo de la función", () => {
    // Al revés daríamos por muerta una ejecución todavía viva y dejaríamos arrancar otra
    // en paralelo — exactamente lo que el bloqueo de syncAll evita.
    expect(SYNC_STALE_AFTER_MS).toBeGreaterThan(SYNC_MAX_DURATION_SECONDS * 1000);
  });

  it("la fecha límite deja margen antes de que corte la plataforma", () => {
    const inicio = new Date("2026-09-18T12:00:00Z");
    const limite = syncDeadline(inicio).getTime() - inicio.getTime();

    expect(limite).toBe(SYNC_MAX_DURATION_SECONDS * 1000 - SYNC_DEADLINE_MARGIN_MS);
    expect(limite).toBeLessThan(SYNC_MAX_DURATION_SECONDS * 1000);
    expect(limite).toBeGreaterThan(0);
  });

  it.each(SYNC_ROUTES)("%s declara el mismo maxDuration", (route) => {
    const source = readFileSync(path.join(process.cwd(), route), "utf8");
    const declared = /export const maxDuration = (\d+)/.exec(source)?.[1];

    expect(declared).toBe(String(SYNC_MAX_DURATION_SECONDS));
  });
});
