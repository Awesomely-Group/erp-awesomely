/**
 * El secreto de los webhooks de entrada.
 *
 * Lo que se sujeta aquí es que la ventana de compatibilidad **se nota**: si un webhook
 * sigue autenticándose con `CRON_SECRET` o con el viejo `ERP_API_KEY`, tiene que
 * quedar dicho en el log y con el nombre del origen, porque ese aviso es el único
 * criterio para saber cuándo se puede borrar la rama. Sin él, la "ventana" duraría
 * para siempre: todo seguiría funcionando y nadie tendría motivo para mirar.
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

describe("webhookSecretValido", () => {
  it("el secreto propio entra sin avisar de nada", () => {
    expect(webhookSecretValido("propio-de-los-webhooks", "jira")).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("CRON_SECRET entra todavía, pero deja dicho en el log qué webhook falta migrar", () => {
    expect(webhookSecretValido("el-de-los-crons", "holded")).toBe(true);

    const aviso = vi.mocked(console.warn).mock.calls[0]?.[0] as string;
    expect(aviso).toContain("holded");
    expect(aviso).toContain("CRON_SECRET");
  });

  it("el ERP_API_KEY viejo también, y se nombra para poder retirarlo", () => {
    expect(webhookSecretValido("la-maestra-vieja", "jira")).toBe(true);
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain("ERP_API_KEY");
  });

  it("un secreto cualquiera no entra", () => {
    expect(webhookSecretValido("lo-que-sea", "jira")).toBe(false);
  });

  it("sin cabecera no entra, aunque el prefijo coincida", () => {
    expect(webhookSecretValido(null, "jira")).toBe(false);
    expect(webhookSecretValido("propio", "jira")).toBe(false);
  });

  it("una variable sin configurar no abre la puerta a la cadena vacía", () => {
    delete process.env.WEBHOOK_SYNC_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.ERP_API_KEY;

    expect(webhookSecretValido("", "jira")).toBe(false);
  });

  it("cuando se borren las dos ramas legacy, solo valdrá el propio", () => {
    // El estado al que se va: retirar CRON_SECRET/ERP_API_KEY del entorno de los
    // webhooks no debe dejar pasar nada más.
    delete process.env.CRON_SECRET;
    delete process.env.ERP_API_KEY;

    expect(webhookSecretValido("propio-de-los-webhooks", "jira")).toBe(true);
    expect(webhookSecretValido("el-de-los-crons", "jira")).toBe(false);
  });
});
