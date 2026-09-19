import { describe, it, expect } from "vitest";
import {
  buildMonthlyWindows,
  buildScopeWindow,
  buildQuarterlyWindows,
  parseSyncMode,
  pickCompanyForFullSync,
  resolveSyncScope,
  yearsInScope,
} from "./sync-scope";

// Referencia fija para que los tests no dependan del día en que se ejecuten.
const NOW = new Date(2026, 8, 16); // 16 de septiembre de 2026 (mes 8 = septiembre)

// ─── resolveSyncScope ──────────────────────────────────────────────────────────

describe("resolveSyncScope", () => {
  it("en modo full arranca el 1 de enero del año configurado", () => {
    const scope = resolveSyncScope("full", { fromYear: 2020, now: NOW });
    expect(scope.mode).toBe("full");
    expect(scope.fromDate).toEqual(new Date(2020, 0, 1));
  });

  it("en incremental arranca el 1 de enero del ejercicio en curso", () => {
    // El lookback de 60 días llegaría solo al 1 de julio, pero un documento de
    // febrero puede haberse corregido o borrado hoy: el año entero se relee.
    const scope = resolveSyncScope("incremental", {
      fromYear: 2020,
      now: NOW,
      lookbackDays: 60,
    });
    expect(scope.fromDate).toEqual(new Date(2026, 0, 1));
  });

  it("en enero el lookback sigue alcanzando el cierre del año anterior", () => {
    // 5-ene-2027 menos 60 días = 6-nov-2026 → 1 de noviembre. Quedarse en el
    // 1 de enero dejaría fuera diciembre justo cuando más se retoca.
    const scope = resolveSyncScope("incremental", {
      fromYear: 2020,
      now: new Date(2027, 0, 5),
      lookbackDays: 60,
    });
    expect(scope.fromDate).toEqual(new Date(2026, 10, 1));
  });

  it("un lookback corto no recorta el ejercicio en curso", () => {
    const scope = resolveSyncScope("incremental", {
      fromYear: 2020,
      now: NOW,
      lookbackDays: 1,
    });
    expect(scope.fromDate).toEqual(new Date(2026, 0, 1));
  });

  it("nunca retrocede más allá del inicio de la historia configurada", () => {
    const scope = resolveSyncScope("incremental", {
      fromYear: 2026,
      now: NOW,
      lookbackDays: 3650,
    });
    expect(scope.fromDate).toEqual(new Date(2026, 0, 1));
  });
});

// ─── buildMonthlyWindows ───────────────────────────────────────────────────────

describe("buildMonthlyWindows", () => {
  it("cubre desde el mes inicial hasta el mes final, ambos incluidos", () => {
    const windows = buildMonthlyWindows(new Date(2026, 6, 1), NOW);
    expect(windows).toEqual([
      { start: "2026-07-01", end: "2026-07-31" },
      { start: "2026-08-01", end: "2026-08-31" },
      { start: "2026-09-01", end: "2026-09-30" },
    ]);
  });

  it("cruza el cambio de año", () => {
    const windows = buildMonthlyWindows(
      new Date(2025, 10, 1),
      new Date(2026, 1, 5),
    );
    expect(windows.map((w) => w.start)).toEqual([
      "2025-11-01",
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });

  it("respeta los febreros bisiestos", () => {
    const [feb] = buildMonthlyWindows(new Date(2028, 1, 1), new Date(2028, 1, 9));
    expect(feb.end).toBe("2028-02-29");
  });

  it("devuelve una lista vacía si el inicio es posterior al fin", () => {
    expect(buildMonthlyWindows(new Date(2026, 5, 1), new Date(2026, 2, 1))).toEqual(
      [],
    );
  });

  // Esta es la razón de ser del modo incremental: cada ventana es una llamada
  // a la API, y la cuota de Holded se mide en llamadas.
  it("el ahorro del incremental frente al full es de dos órdenes de magnitud", () => {
    const full = buildMonthlyWindows(new Date(2020, 0, 1), NOW);
    const incremental = buildMonthlyWindows(new Date(2026, 6, 1), NOW);
    expect(full).toHaveLength(81);
    expect(incremental).toHaveLength(3);
  });
});

// ─── buildQuarterlyWindows ─────────────────────────────────────────────────────

describe("buildQuarterlyWindows", () => {
  it("genera un trimestre por ventana hasta la fecha final", () => {
    const windows = buildQuarterlyWindows(new Date(2026, 0, 1), NOW);
    expect(windows).toHaveLength(3); // Q1, Q2 y Q3 de 2026
    expect(windows[0].starttmp).toBe(
      Math.floor(new Date(2026, 0, 1).getTime() / 1000),
    );
    expect(windows[0].endtmp).toBe(
      Math.floor(new Date(2026, 3, 1).getTime() / 1000),
    );
  });

  it("empieza en el trimestre que contiene la fecha inicial", () => {
    const windows = buildQuarterlyWindows(new Date(2026, 7, 20), NOW);
    expect(windows).toHaveLength(1);
    expect(windows[0].starttmp).toBe(
      Math.floor(new Date(2026, 6, 1).getTime() / 1000),
    );
  });
});

// ─── yearsInScope ──────────────────────────────────────────────────────────────

describe("yearsInScope", () => {
  it("full devuelve todos los ejercicios", () => {
    const scope = resolveSyncScope("full", { fromYear: 2020, now: NOW });
    expect(yearsInScope(scope, NOW)).toEqual([
      2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ]);
  });

  it("incremental se queda en el ejercicio abierto", () => {
    const scope = resolveSyncScope("incremental", {
      fromYear: 2020,
      now: NOW,
      lookbackDays: 60,
    });
    expect(yearsInScope(scope, NOW)).toEqual([2026]);
  });

  it("incremental incluye el ejercicio anterior si la ventana lo alcanza", () => {
    const enero = new Date(2026, 0, 20);
    const scope = resolveSyncScope("incremental", {
      fromYear: 2020,
      now: enero,
      lookbackDays: 60,
    });
    expect(yearsInScope(scope, enero)).toEqual([2025, 2026]);
  });
});

// ─── parseSyncMode ─────────────────────────────────────────────────────────────

describe("parseSyncMode", () => {
  it("solo 'full' activa la relectura completa", () => {
    expect(parseSyncMode("full")).toBe("full");
    expect(parseSyncMode("incremental")).toBe("incremental");
    expect(parseSyncMode(null)).toBe("incremental");
    expect(parseSyncMode(undefined)).toBe("incremental");
    expect(parseSyncMode("FULL")).toBe("incremental");
  });
});

// ─── buildScopeWindow ──────────────────────────────────────────────────────────

describe("buildScopeWindow", () => {
  // El contrato que importa: la ventana única tiene que cubrir exactamente lo
  // mismo que cubrían todas las mensuales juntas. Si se recortara —por ejemplo
  // cortando en "hoy" en vez de a fin de mes— las compras con fecha futura
  // dentro del mes en curso desaparecerían del listado, y el sync las leería
  // como borradas en Holded.
  it.each([
    ["mismo mes", new Date(2026, 8, 1), new Date(2026, 8, 16)],
    ["varios meses", new Date(2026, 6, 1), new Date(2026, 8, 16)],
    ["varios años", new Date(2020, 0, 1), new Date(2026, 8, 16)],
    ["desde mitad de mes", new Date(2026, 6, 20), new Date(2026, 8, 16)],
  ])("cubre lo mismo que las ventanas mensuales (%s)", (_caso, from, to) => {
    const meses = buildMonthlyWindows(from, to);
    const ventana = buildScopeWindow(from, to);

    expect(ventana).toEqual({
      start: meses[0].start,
      end: meses[meses.length - 1].end,
    });
  });

  it("termina a fin de mes, no el día de hoy", () => {
    expect(buildScopeWindow(new Date(2026, 8, 1), new Date(2026, 8, 16))).toEqual({
      start: "2026-09-01",
      end: "2026-09-30",
    });
  });

  it("devuelve null si no hay nada que cubrir", () => {
    expect(buildScopeWindow(new Date(2026, 8, 16), new Date(2026, 6, 1))).toBeNull();
  });
});

describe("pickCompanyForFullSync", () => {
  const empresa = (name: string, lastFullSyncAt: Date | null) => ({
    id: name.toLowerCase(),
    name,
    lastFullSyncAt,
  });

  it("elige la que lleva más tiempo sin pasada completa", () => {
    const elegida = pickCompanyForFullSync([
      empresa("Awesomely SL", new Date("2026-09-13T06:00:00Z")),
      empresa("Awesomely OU", new Date("2026-09-06T06:00:00Z")),
    ]);

    expect(elegida?.name).toBe("Awesomely OU");
  });

  it("prioriza la que no ha tenido ninguna", () => {
    const elegida = pickCompanyForFullSync([
      empresa("Awesomely SL", new Date("2020-01-01T00:00:00Z")),
      empresa("Awesomely OU", null),
    ]);

    expect(elegida?.name).toBe("Awesomely OU");
  });

  it("desempata por nombre, no por el orden de entrada", () => {
    const porNombre = pickCompanyForFullSync([
      empresa("Awesomely SL", null),
      empresa("Awesomely OU", null),
    ]);
    const alReves = pickCompanyForFullSync([
      empresa("Awesomely OU", null),
      empresa("Awesomely SL", null),
    ]);

    expect(porNombre?.name).toBe("Awesomely OU");
    expect(alReves?.name).toBe("Awesomely OU");
  });

  it("con la misma fecha también desempata por nombre", () => {
    const misma = new Date("2026-09-13T06:00:00Z");
    const elegida = pickCompanyForFullSync([
      empresa("Awesomely SL", misma),
      empresa("Awesomely OU", misma),
    ]);

    expect(elegida?.name).toBe("Awesomely OU");
  });

  it("no altera la lista que recibe", () => {
    const lista = [
      empresa("Awesomely SL", new Date("2026-09-13T06:00:00Z")),
      empresa("Awesomely OU", null),
    ];
    pickCompanyForFullSync(lista);

    expect(lista.map((c) => c.name)).toEqual(["Awesomely SL", "Awesomely OU"]);
  });

  it("devuelve null sin empresas", () => {
    expect(pickCompanyForFullSync([])).toBeNull();
  });

  it("rota: la elegida deja de serlo en la siguiente pasada", () => {
    const empresas = [
      empresa("Awesomely SL", null),
      empresa("Awesomely OU", null),
    ];

    const primera = pickCompanyForFullSync(empresas)!;
    expect(primera.name).toBe("Awesomely OU");

    // Tras su pasada, le toca a la otra.
    const segunda = pickCompanyForFullSync(
      empresas.map((c) =>
        c.name === primera.name
          ? { ...c, lastFullSyncAt: new Date("2026-09-20T06:00:00Z") }
          : c,
      ),
    )!;
    expect(segunda.name).toBe("Awesomely SL");
  });
});
