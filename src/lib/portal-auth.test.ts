import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { authenticatePortalRequest, snapshotStaleHours } from "./portal-auth";

const ORIGINAL_ENV = { ...process.env };

function post(headers: Record<string, string> = {}): Request {
  return new Request("https://erp.example/api/portal/clients/resolve", { method: "POST", headers });
}

beforeEach(() => {
  process.env.GIGSONAPPS_PORTAL_SECRET = "secreto-de-gigson";
  process.env.LTTOOLS_PORTAL_SECRET = "secreto-de-latroupe";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("authenticatePortalRequest", () => {
  it("acepta el secreto de su marca", () => {
    expect(authenticatePortalRequest(post({ "x-webhook-secret": "secreto-de-gigson" }), "SOLUTIONS")).toBe(true);
  });

  it("rechaza el secreto de la otra marca", () => {
    // Si esto pasara, el portal de una marca leería los clientes de la otra.
    expect(authenticatePortalRequest(post({ "x-webhook-secret": "secreto-de-latroupe" }), "SOLUTIONS")).toBe(false);
  });

  it("rechaza sin cabecera y con marca inventada", () => {
    expect(authenticatePortalRequest(post(), "SOLUTIONS")).toBe(false);
    expect(authenticatePortalRequest(post({ "x-webhook-secret": "secreto-de-gigson" }), "OTRA")).toBe(false);
  });

  it("no se conforma con un prefijo correcto", () => {
    expect(authenticatePortalRequest(post({ "x-webhook-secret": "secreto-de-gigso" }), "SOLUTIONS")).toBe(false);
    expect(authenticatePortalRequest(post({ "x-webhook-secret": "secreto-de-gigson-y-mas" }), "SOLUTIONS")).toBe(false);
  });

  it("con el secreto sin configurar no entra nadie", () => {
    delete process.env.GIGSONAPPS_PORTAL_SECRET;
    expect(authenticatePortalRequest(post({ "x-webhook-secret": "secreto-de-gigson" }), "SOLUTIONS")).toBe(false);
    // Y una cabecera vacía tampoco puede casar con un secreto vacío.
    expect(authenticatePortalRequest(post({ "x-webhook-secret": "" }), "SOLUTIONS")).toBe(false);
  });

  it("usa el secreto del portal, no el de propuestas", () => {
    // Son deliberadamente distintos: el de propuestas puede crear Budgets y mandar a firmar.
    process.env.GIGSONAPPS_PROPOSALS_SECRET = "secreto-de-propuestas";
    expect(authenticatePortalRequest(post({ "x-webhook-secret": "secreto-de-propuestas" }), "SOLUTIONS")).toBe(false);
  });
});

describe("snapshotStaleHours", () => {
  it("por defecto deja margen a la ventana flexible de los crons de Hobby", () => {
    // Diario + hasta 1 h de deriva = ~25 h entre pasadas buenas. Con 24 h el portal
    // enseñaría "desactualizado" un día de cada dos sin que pase nada.
    delete process.env.PORTAL_SNAPSHOT_STALE_HOURS;
    expect(snapshotStaleHours()).toBe(30);
    expect(snapshotStaleHours()).toBeGreaterThan(25);
  });

  it("ignora un valor inservible en vez de dar por viejo todo", () => {
    process.env.PORTAL_SNAPSHOT_STALE_HOURS = "nada";
    expect(snapshotStaleHours()).toBe(30);
    process.env.PORTAL_SNAPSHOT_STALE_HOURS = "0";
    expect(snapshotStaleHours()).toBe(30);
    process.env.PORTAL_SNAPSHOT_STALE_HOURS = "6";
    expect(snapshotStaleHours()).toBe(6);
  });
});

/**
 * El allowlist de `src/proxy.ts` es la única puerta: sin entrada, estas rutas redirigen
 * a /login y el portal no funciona; con una entrada de más, se abre sin sesión algo que
 * no debía. En local no se nota —el login se salta entero cuando NODE_ENV !== production—
 * así que el fallo solo aparecería en producción.
 */
describe("rutas sin sesión declaradas en el proxy", () => {
  const proxy = readFileSync(path.join(process.cwd(), "src/proxy.ts"), "utf8");

  it("el prefijo del portal y el cron de horas están en el allowlist", () => {
    expect(proxy).toContain('p.startsWith("/api/portal/")');
    expect(proxy).toContain('p === "/api/sync/hours"');
  });

  it("el cron de horas se declara aparte porque /api/sync es coincidencia exacta", () => {
    // Si algún día se convierte en startsWith, esta línea sobra — y hay que revisarlo,
    // no borrar el test sin mirar.
    expect(proxy).toContain('p === "/api/sync" ||');
  });
});
