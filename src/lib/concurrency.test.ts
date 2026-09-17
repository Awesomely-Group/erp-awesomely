import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("mapWithConcurrency", () => {
  it("conserva el orden de la entrada", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it("nunca supera el límite de operaciones en vuelo", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("no espera a que termine el lote para empezar el siguiente", async () => {
    const slow = deferred();
    const started: number[] = [];

    const run = mapWithConcurrency([0, 1, 2], 2, async (n) => {
      started.push(n);
      if (n === 0) await slow.promise;
      return n;
    });

    await new Promise((r) => setTimeout(r, 0));
    // El 1 termina enseguida y deja entrar al 2 aunque el 0 siga colgado.
    expect(started).toContain(2);

    slow.resolve();
    expect(await run).toEqual([0, 1, 2]);
  });

  it("admite lista vacía y límites degenerados", async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n)).toEqual([1, 2]);
  });

  it("propaga el error de una operación", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
