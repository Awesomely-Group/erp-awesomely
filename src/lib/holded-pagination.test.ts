import { describe, it, expect, vi, afterEach } from "vitest";
import type { HoldedInvoiceV2Raw } from "./holded";

// Los listados de documentos de la v2 topan en 200 elementos por respuesta y solo
// avanzan con el `cursor` devuelto (comprobado contra la API real, ver el
// comentario de holded.ts). Estos tests fijan las dos cosas que se derivan de
// ahí: que se sigue el cursor hasta el final, y que cuando no se puede, el
// listado se marca incompleto en vez de pasar por una foto completa.

/** `IS_V2` se evalúa al cargar el módulo, así que hay que recargarlo con el env puesto. */
async function loadHoldedV2(): Promise<typeof import("./holded")> {
  vi.resetModules();
  vi.stubEnv("HOLDED_API_VERSION", "v2");
  return import("./holded");
}

function doc(id: string): HoldedInvoiceV2Raw {
  return { id, date: "2026-01-15", total: "100,00", status: "pending" };
}

/** Lo que el mock de `fetch` va registrando de cada llamada. */
interface Call {
  path: string;
  limit: string | null;
  cursor: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface PageResponse {
  items?: HoldedInvoiceV2Raw[];
  cursor?: string | null;
  has_more?: boolean;
}

/** Instala un `fetch` falso que responde según la URL pedida. */
function mockFetch(
  responder: (call: Call) => PageResponse | HoldedInvoiceV2Raw[] | { status: number },
): Call[] {
  const calls: Call[] = [];

  vi.stubGlobal("fetch", (input: string) => {
    const url = new URL(input);
    const call: Call = {
      path: url.pathname.replace("/api/v2", ""),
      limit: url.searchParams.get("limit"),
      cursor: url.searchParams.get("cursor"),
      startDate: url.searchParams.get("start_date"),
      endDate: url.searchParams.get("end_date"),
    };
    calls.push(call);

    const body = responder(call);
    if ("status" in body && typeof body.status === "number") {
      return Promise.resolve({
        ok: false,
        status: body.status,
        text: () => Promise.resolve("boom"),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  });

  return calls;
}

/** Páginas de `total` documentos servidas de `pageSize` en `pageSize`. */
function paged(total: number, pageSize = 200) {
  return (call: Call): PageResponse => {
    const page = call.cursor ? Number(call.cursor.split(":")[1]) : 1;
    const from = (page - 1) * pageSize;
    const items = Array.from({ length: Math.max(0, Math.min(pageSize, total - from)) }, (_, i) =>
      doc(`doc-${from + i}`),
    );
    const hasMore = from + items.length < total;
    return { items, cursor: hasMore ? `page:${page + 1}` : null, has_more: hasMore };
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getAllInvoicesPaginated('invoice') — ventas", () => {
  it("sigue el cursor hasta agotarlo y devuelve todas las facturas", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const calls = mockFetch(paged(450));

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(result.complete).toBe(true);
    expect(result.documents).toHaveLength(450);
    expect(new Set(result.documents.map((d) => d.id)).size).toBe(450);

    // 3 páginas de 200 (la última con 50 y has_more=false) + la relectura de la
    // primera página para comprobar que la lista no se movió durante el barrido.
    expect(calls.map((c) => c.cursor)).toEqual([null, "page:2", "page:3", null]);
    expect(calls.every((c) => c.path === "/invoices")).toBe(true);
  });

  it("pide páginas de 200, no el limit=5000 que la API ignoraba", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const calls = mockFetch(paged(10));

    await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(calls).toHaveLength(1);
    expect(calls[0].limit).toBe("200");
  });

  it("una sola llamada cuando la empresa tiene menos de 200 facturas", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const calls = mockFetch(paged(185));

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(calls).toHaveLength(1);
    expect(result.documents).toHaveLength(185);
    expect(result.complete).toBe(true);
  });

  it("marca el listado incompleto si falla una página intermedia", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const pages = paged(450);
    mockFetch((call) => (call.cursor === "page:2" ? { status: 500 } : pages(call)));

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(result.complete).toBe(false);
    expect(result.incompleteReason).toContain("/invoices");
    // Lo ya recibido se devuelve: sirve para actualizar, no para deducir borrados.
    expect(result.documents).toHaveLength(200);
  });

  it("marca el listado incompleto si el cursor nunca termina", async () => {
    const { HoldedClient } = await loadHoldedV2();
    // has_more siempre a true: un cursor que no avanza no puede colgar el sync.
    const calls = mockFetch(() => ({
      items: [doc(`x-${Math.random()}`)],
      cursor: "page:2",
      has_more: true,
    }));

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(result.complete).toBe(false);
    expect(result.incompleteReason).toContain("has_more");
    expect(calls.length).toBeLessThanOrEqual(200);
  });

  it("marca el listado incompleto si dice que hay más pero no da cursor", async () => {
    const { HoldedClient } = await loadHoldedV2();
    mockFetch(() => ({ items: [doc("a")], cursor: null, has_more: true }));

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(result.complete).toBe(false);
    expect(result.incompleteReason).toContain("sin cursor");
    expect(result.documents).toHaveLength(1);
  });

  it("no repite documentos si el cursor posicional los devuelve dos veces", async () => {
    const { HoldedClient } = await loadHoldedV2();
    mockFetch((call) =>
      call.cursor
        ? { items: [doc("a"), doc("c")], cursor: null, has_more: false }
        : { items: [doc("a"), doc("b")], cursor: "page:2", has_more: true },
    );

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(result.documents.map((d) => d.id)).toEqual(["a", "b", "c"]);
    expect(result.complete).toBe(true);
  });

  describe("respuesta como array plano, sin sobre {items, cursor, has_more}", () => {
    it("la da por completa si trae menos elementos de los pedidos", async () => {
      const { HoldedClient } = await loadHoldedV2();
      mockFetch(() => Array.from({ length: 42 }, (_, i) => doc(`d-${i}`)));

      const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

      expect(result.complete).toBe(true);
      expect(result.documents).toHaveLength(42);
    });

    it("la da por truncada si trae exactamente los que se pidieron", async () => {
      const { HoldedClient } = await loadHoldedV2();
      mockFetch(() => Array.from({ length: 200 }, (_, i) => doc(`d-${i}`)));

      const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

      expect(result.complete).toBe(false);
      expect(result.incompleteReason).toContain("truncada");
      expect(result.documents).toHaveLength(200);
    });
  });
});

describe("getAllInvoicesPaginated('purchase') — compras", () => {
  it("pide una sola ventana de fechas para todo el ámbito y la pagina por cursor", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const calls = mockFetch(paged(250));

    const result = await new HoldedClient("k").getAllInvoicesPaginated("purchase", {
      fromDate: new Date(2026, 0, 1),
    });

    expect(result.complete).toBe(true);
    expect(result.documents).toHaveLength(250);

    // 2 páginas + verificación, todas sobre la misma ventana: antes esto eran
    // ~9 llamadas, una por mes.
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.startDate))).toEqual(new Set(["2026-01-01"]));
    expect(new Set(calls.map((c) => c.endDate)).size).toBe(1);
    expect(calls[0].endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calls.every((c) => c.path === "/purchases")).toBe(true);
  });

  it("marca el listado incompleto si la ventana falla", async () => {
    const { HoldedClient } = await loadHoldedV2();
    mockFetch(() => ({ status: 429 }));

    const result = await new HoldedClient("k").getAllInvoicesPaginated("purchase", {
      fromDate: new Date(2026, 0, 1),
    });

    expect(result.complete).toBe(false);
    expect(result.incompleteReason).toContain("start_date=2026-01-01");
    expect(result.documents).toHaveLength(0);
  });
});

describe("estabilidad del barrido", () => {
  it("marca incompleto si la primera página cambia mientras se pagina", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const pages = paged(450);
    let sweepDone = false;

    const calls = mockFetch((call) => {
      // Al terminar el barrido, alguien ha creado un documento: la lista se
      // desplaza y la relectura de la primera página ya no coincide.
      if (sweepDone && !call.cursor) {
        return { items: [doc("nuevo"), ...Array.from({ length: 199 }, (_, i) => doc(`doc-${i}`))], cursor: "page:2", has_more: true };
      }
      const page = pages(call);
      if (!page.has_more) sweepDone = true;
      return page;
    });

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(result.complete).toBe(false);
    expect(result.incompleteReason).toContain("cambió durante el barrido");
    // Lo leído se conserva: sirve para actualizar, no para deducir borrados.
    expect(result.documents).toHaveLength(450);
    expect(calls).toHaveLength(4);
  });

  it("no gasta la llamada de verificación si solo hubo una página", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const calls = mockFetch(paged(150));

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(result.complete).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("marca incompleto si la verificación no se puede hacer", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const pages = paged(450);
    let sweepDone = false;

    mockFetch((call) => {
      if (sweepDone && !call.cursor) return { status: 500 };
      const page = pages(call);
      if (!page.has_more) sweepDone = true;
      return page;
    });

    const result = await new HoldedClient("k").getAllInvoicesPaginated("invoice");

    expect(result.complete).toBe(false);
    expect(result.incompleteReason).toContain("verificar");
  });
});

describe("sin ninguna ventana que pedir", () => {
  it("no da el listado por completo: autorizaría a borrarlo todo", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const calls = mockFetch(() => ({ items: [], cursor: null, has_more: false }));

    // fromDate en el futuro → buildMonthlyWindows no genera ninguna ventana.
    const result = await new HoldedClient("k").getAllInvoicesPaginated("purchase", {
      fromDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
    });

    expect(calls).toHaveLength(0);
    expect(result.documents).toHaveLength(0);
    expect(result.complete).toBe(false);
  });
});

describe("getAllProformasPaginated", () => {
  it("sigue el cursor igual que las facturas", async () => {
    const { HoldedClient } = await loadHoldedV2();
    const calls = mockFetch(paged(350));

    const result = await new HoldedClient("k").getAllProformasPaginated();

    expect(result.complete).toBe(true);
    expect(result.documents).toHaveLength(350);
    // 2 páginas + la relectura de verificación
    expect(calls.map((c) => c.path)).toEqual([
      "/proformas",
      "/proformas",
      "/proformas",
    ]);
  });

  it("aplica el mapeo de estado propio de las proformas", async () => {
    const { HoldedClient } = await loadHoldedV2();
    // "overdue" es 3 en facturas y 4 en proformas (3 significa "convertida").
    mockFetch(() => ({
      items: [{ ...doc("pf-1"), status: "overdue" }],
      cursor: null,
      has_more: false,
    }));

    const result = await new HoldedClient("k").getAllProformasPaginated();

    expect(result.documents[0].status).toBe(4);
  });
});
