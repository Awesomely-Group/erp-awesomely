/**
 * El puente entre el accountId de Jira y el email sombra de Giro.
 *
 * Esto estaba roto en silencio: `hour-buckets.ts` construía el email concatenando el
 * accountId tal cual, mientras Giro lo genera slugificado. Un accountId moderno de
 * Atlassian lleva dos puntos (`712020:dba4dc92-…`), así que **ninguna** persona con
 * cuenta moderna casaba — solo las hexadecimales antiguas. El síntoma no era un error:
 * eran horas cayendo en "sin atribuir" que deberían estar consumiendo una bolsa.
 */
import { describe, expect, it } from "vitest";
import { jiraAccountIdFromGiroEmail, shadowEmailFor, slugAccountId } from "@/lib/hour-buckets";

describe("slugAccountId", () => {
  it("convierte los dos puntos de un accountId moderno, que era el caso que fallaba", () => {
    expect(slugAccountId("712020:dba4dc92-1f0e-4a7b-9c3d-000000000000")).toBe(
      "712020-dba4dc92-1f0e-4a7b-9c3d-000000000000",
    );
  });

  it("deja intacto un accountId hexadecimal antiguo", () => {
    expect(slugAccountId("5f8a1b2c3d4e5f6a7b8c9d0e")).toBe("5f8a1b2c3d4e5f6a7b8c9d0e");
  });

  it("pasa a minúsculas y recorta los guiones de los extremos", () => {
    expect(slugAccountId(":ABC:")).toBe("abc");
  });
});

describe("shadowEmailFor ↔ jiraAccountIdFromGiroEmail", () => {
  it("el email que construimos es el que Giro sabe leer", () => {
    const accountId = "712020:dba4dc92-1f0e-4a7b-9c3d-000000000000";
    const email = shadowEmailFor(accountId);

    expect(email).toBe("shadow+712020-dba4dc92-1f0e-4a7b-9c3d-000000000000@migrated.giro.internal");
    expect(jiraAccountIdFromGiroEmail(email)).toBe(slugAccountId(accountId));
  });

  it("un email normal no se confunde con uno sombra", () => {
    expect(jiraAccountIdFromGiroEmail("jaume@somosgigson.com")).toBeNull();
  });
});
