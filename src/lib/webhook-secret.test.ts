/**
 * El secreto de los webhooks de entrada.
 *
 * Lo que se sujeta aquí es que **un rechazo deja rastro**. Un webhook que falla no
 * tiene a nadie delante: el síntoma es que los datos dejan de llegar, en silencio y
 * puede que días más tarde. Sin el log, "¿por qué no entra nada de Holded?" no tiene
 * respuesta; con él, se lee de qué proveedor venía y por qué se rechazó.
 *
 * Y que `CRON_SECRET` **ya no abre esta puerta**: era la rama de compatibilidad, y
 * reutilizar el secreto de los crons en un panel de un tercero es justo lo que este
 * módulo existe para impedir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webhookSecretValido } from "@/lib/webhook-secret";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  process.env.WEBHOOK_SYNC_SECRET = "propio-de-los-webhooks";
  process.env.CRON_SECRET = "el-de-los-crons";
  process.env.ERP_API_KEY = "la-maestra-vieja";
});

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL };
});

const aviso = (): string => vi.mocked(console.warn).mock.calls[0]?.[0] as string;

describe("webhookSecretValido", () => {
  it("el secreto propio entra, y sin ruido en el log", () => {
    expect(webhookSecretValido("propio-de-los-webhooks", "jira")).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("CRON_SECRET ya NO abre los webhooks", () => {
    expect(webhookSecretValido("el-de-los-crons", "holded")).toBe(false);
  });

  it("el antiguo ERP_API_KEY tampoco", () => {
    expect(webhookSecretValido("la-maestra-vieja", "jira")).toBe(false);
  });

  it("un rechazo dice de qué proveedor venía y por qué", () => {
    webhookSecretValido("lo-que-sea", "holded");

    expect(aviso()).toContain("holded");
    expect(aviso()).toContain("no coincide");
  });

  it("sin cabecera, el motivo es ese y no otro", () => {
    expect(webhookSecretValido(null, "jira")).toBe(false);
    expect(aviso()).toContain("sin cabecera");
  });

  it("si la variable no está configurada, lo dice en vez de rechazar a secas", () => {
    // El caso que de otro modo cuesta una tarde: desplegar sin la variable y ver
    // 401 sin saber si el problema está en el panel o en el entorno.
    delete process.env.WEBHOOK_SYNC_SECRET;

    expect(webhookSecretValido("propio-de-los-webhooks", "jira")).toBe(false);
    expect(aviso()).toContain("no está configurado");
  });

  it("la cadena vacía no entra aunque la variable esté vacía", () => {
    process.env.WEBHOOK_SYNC_SECRET = "";

    expect(webhookSecretValido("", "jira")).toBe(false);
  });
});
