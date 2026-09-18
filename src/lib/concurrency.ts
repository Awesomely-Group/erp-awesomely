/**
 * Recorre una lista aplicando `fn` con un número máximo de operaciones en
 * vuelo. Unifica el troceado manual que ya se hacía a mano en `sync.ts`, con la
 * diferencia de que aquí no hay barrera por lote: en cuanto una operación
 * termina entra la siguiente, así una lenta no frena a las demás.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];

  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: effectiveLimit }, () => worker()));
  return results;
}
