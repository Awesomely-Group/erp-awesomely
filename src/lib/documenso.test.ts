import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyWebhookSecret } from "./documenso";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.DOCUMENSO_WEBHOOK_SECRET = "secreto-del-webhook";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("verifyWebhookSecret", () => {
  it("acepta la cabecera que coincide con el secreto configurado", () => {
    expect(verifyWebhookSecret("secreto-del-webhook")).toBe(true);
  });

  it("rechaza un secreto distinto", () => {
    expect(verifyWebhookSecret("otro-secreto")).toBe(false);
  });

  // Documenso envía la cabecera vacía cuando el webhook se configuró sin secreto.
  // Aceptarla equivaldría a no verificar nada.
  it("rechaza la cabecera vacía", () => {
    expect(verifyWebhookSecret("")).toBe(false);
  });

  it("rechaza la petición sin cabecera", () => {
    expect(verifyWebhookSecret(null)).toBe(false);
  });

  it("rechaza si el ERP no tiene secreto configurado", () => {
    delete process.env.DOCUMENSO_WEBHOOK_SECRET;
    expect(verifyWebhookSecret("secreto-del-webhook")).toBe(false);
  });

  // `timingSafeEqual` lanza si los operandos no miden lo mismo. Comparando digests
  // SHA-256 la longitud es siempre 32 bytes, así que una cabecera más larga o más
  // corta devuelve false en vez de romper la ruta con un 500.
  it("no lanza cuando la longitud no coincide", () => {
    expect(verifyWebhookSecret("x")).toBe(false);
    expect(verifyWebhookSecret("secreto-del-webhook-con-cola-larguísima")).toBe(false);
  });
});
