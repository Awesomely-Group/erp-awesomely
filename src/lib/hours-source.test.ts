/**
 * De dónde salen las horas de un proyecto.
 *
 * El caso que justifica este módulo es el tercer estado. Hoy un proyecto sin vincular
 * cae a Tempo y todo funciona; el día que Tempo se apague, esa misma rama devolvería
 * una lista vacía de worklogs y el ERP enseñaría **consumo cero con la bolsa intacta**
 * — un número equivocado presentado como un número, que es peor que un error.
 * `UNAVAILABLE` existe para que eso llegue a la pantalla como "proyecto sin vincular".
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveHoursSource } from "@/lib/hours-source";

const BASE_URL_ORIGINAL = process.env.GIRO_BASE_URL;

function proyecto(overrides: {
  giroProjectId?: string | null;
  giroApiKey?: string | null;
  tempoApiToken?: string | null;
}) {
  return {
    giroProjectId: overrides.giroProjectId ?? null,
    workspace: {
      giroApiKey: overrides.giroApiKey ?? null,
      tempoApiToken: overrides.tempoApiToken ?? null,
    },
  };
}

beforeEach(() => {
  process.env.GIRO_BASE_URL = "https://giro.test";
});

afterEach(() => {
  if (BASE_URL_ORIGINAL === undefined) delete process.env.GIRO_BASE_URL;
  else process.env.GIRO_BASE_URL = BASE_URL_ORIGINAL;
});

describe("resolveHoursSource", () => {
  it("vinculado y con credenciales: Giro", () => {
    expect(resolveHoursSource(proyecto({ giroProjectId: "p1", giroApiKey: "k", tempoApiToken: "t" }))).toBe(
      "GIRO",
    );
  });

  it("sin vincular pero con Tempo configurado: Tempo, como hasta ahora", () => {
    expect(resolveHoursSource(proyecto({ tempoApiToken: "t" }))).toBe("TEMPO");
  });

  it("sin vincular y sin Tempo: UNAVAILABLE, NUNCA una lista vacía", () => {
    expect(resolveHoursSource(proyecto({}))).toBe("UNAVAILABLE");
  });

  it("vinculado pero sin clave de Giro: cae a Tempo, no finge que puede", () => {
    expect(resolveHoursSource(proyecto({ giroProjectId: "p1", tempoApiToken: "t" }))).toBe("TEMPO");
  });

  it("sin GIRO_BASE_URL no se puede usar Giro aunque todo lo demás esté", () => {
    delete process.env.GIRO_BASE_URL;

    expect(resolveHoursSource(proyecto({ giroProjectId: "p1", giroApiKey: "k", tempoApiToken: "t" }))).toBe(
      "TEMPO",
    );
  });

  it("el día que se apague Tempo, un proyecto sin vincular queda UNAVAILABLE y no en silencio", () => {
    // Exactamente el escenario del cutover: el token de Tempo desaparece del workspace.
    expect(resolveHoursSource(proyecto({ giroProjectId: null, giroApiKey: "k" }))).toBe("UNAVAILABLE");
  });
});
