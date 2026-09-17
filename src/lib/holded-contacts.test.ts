import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getContactsBankData,
  resetContactBankCache,
  type ContactBankRequest,
} from "./holded-contacts";
import type { ContactBankData } from "./holded";

const BANK: ContactBankData = {
  iban: "ES7620770024003102575766",
  holder: "Irene Deu Espinar",
  bic: "CAIXESBBXXX",
  bankName: "CaixaBank",
  paymentMethod: "transfer",
};

function req(contactId: string, companyId = "co_1"): ContactBankRequest {
  return { companyId, apiKey: "secret", contactId };
}

beforeEach(() => {
  resetContactBankCache();
  vi.useRealTimers();
});

describe("getContactsBankData", () => {
  it("devuelve los datos indexados por empresa y contacto", async () => {
    const out = await getContactsBankData([req("c1")], {
      fetchOne: async () => BANK,
    });
    expect(out.get("co_1:c1")).toEqual({
      status: "ok",
      data: BANK,
      fetchedAt: expect.any(Number),
    });
  });

  it("no mezcla el mismo contacto entre empresas distintas", async () => {
    const otro: ContactBankData = { ...BANK, iban: "ES0000000000000000000000" };
    const out = await getContactsBankData([req("c1", "co_1"), req("c1", "co_2")], {
      fetchOne: async (r) => (r.companyId === "co_1" ? BANK : otro),
    });
    expect(out.get("co_1:c1")).toMatchObject({ data: BANK });
    expect(out.get("co_2:c1")).toMatchObject({ data: otro });
  });

  it("no vuelve a pedir un contacto ya cacheado", async () => {
    const fetchOne = vi.fn(async () => BANK);
    await getContactsBankData([req("c1")], { fetchOne });
    await getContactsBankData([req("c1")], { fetchOne });
    expect(fetchOne).toHaveBeenCalledTimes(1);
  });

  it("deduplica el mismo contacto repetido en una llamada", async () => {
    const fetchOne = vi.fn(async () => BANK);
    const out = await getContactsBankData([req("c1"), req("c1"), req("c1")], {
      fetchOne,
    });
    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(out.size).toBe(1);
  });

  it("cachea también el contacto sin IBAN, que es una respuesta real", async () => {
    const sinIban: ContactBankData = {
      iban: null,
      holder: null,
      bic: null,
      bankName: null,
      paymentMethod: null,
    };
    const fetchOne = vi.fn(async () => sinIban);
    await getContactsBankData([req("c1")], { fetchOne });
    const out = await getContactsBankData([req("c1")], { fetchOne });
    expect(fetchOne).toHaveBeenCalledTimes(1);
    expect(out.get("co_1:c1")).toMatchObject({ status: "ok", data: sinIban });
  });

  it("no lanza si Holded falla: lo expresa como unavailable", async () => {
    const out = await getContactsBankData([req("c1")], {
      fetchOne: async () => {
        throw Object.assign(new Error("Holded API error 500"), { status: 500 });
      },
    });
    expect(out.get("co_1:c1")).toEqual({
      status: "unavailable",
      reason: "http",
      httpStatus: 500,
    });
  });

  it("distingue el timeout del fallo de red", async () => {
    const timeout = await getContactsBankData([req("c1")], {
      fetchOne: async () => {
        throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
      },
    });
    expect(timeout.get("co_1:c1")).toMatchObject({ reason: "timeout" });

    const red = await getContactsBankData([req("c2")], {
      fetchOne: async () => {
        throw new Error("fetch failed");
      },
    });
    expect(red.get("co_1:c2")).toMatchObject({ reason: "network" });
  });

  it("reintenta antes el fallo que el acierto (TTL negativo corto)", async () => {
    vi.useFakeTimers();
    const fetchOne = vi
      .fn<(r: ContactBankRequest) => Promise<ContactBankData>>()
      .mockRejectedValueOnce(new Error("caído"))
      .mockResolvedValue(BANK);

    await getContactsBankData([req("c1")], { fetchOne });
    vi.advanceTimersByTime(61_000); // pasa el TTL de error, no el de acierto
    const out = await getContactsBankData([req("c1")], { fetchOne });

    expect(fetchOne).toHaveBeenCalledTimes(2);
    expect(out.get("co_1:c1")).toMatchObject({ status: "ok" });
  });

  it("mantiene el acierto durante su TTL largo", async () => {
    vi.useFakeTimers();
    const fetchOne = vi.fn(async () => BANK);
    await getContactsBankData([req("c1")], { fetchOne });
    vi.advanceTimersByTime(14 * 60 * 1000);
    await getContactsBankData([req("c1")], { fetchOne });
    expect(fetchOne).toHaveBeenCalledTimes(1);
  });

  it("respeta el límite de concurrencia", async () => {
    let inFlight = 0;
    let peak = 0;
    const requests = Array.from({ length: 20 }, (_, i) => req(`c${i}`));
    await getContactsBankData(requests, {
      concurrency: 4,
      fetchOne: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return BANK;
      },
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it("admite lista vacía", async () => {
    expect((await getContactsBankData([])).size).toBe(0);
  });
});
