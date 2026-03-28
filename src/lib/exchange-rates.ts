// Frankfurter API — free ECB exchange rates
// Docs: https://www.frankfurter.app/docs

import { prisma } from "./prisma";

const FRANKFURTER_BASE = "https://api.frankfurter.app";

interface FrankfurterResponse {
  date: string;
  base: string;
  rates: Record<string, number>;
}

export async function getEurRateForDate(
  currency: string,
  date: Date
): Promise<number> {
  if (currency === "EUR") return 1;

  const dateStr = date.toISOString().split("T")[0];

  // Check cache
  const cached = await prisma.exchangeRate.findUnique({
    where: { date_currency: { date, currency } },
  });
  if (cached) return Number(cached.rateToEur);

  // Fetch from Frankfurter
  const res = await fetch(
    `${FRANKFURTER_BASE}/${dateStr}?from=${currency}&to=EUR`,
    { next: { revalidate: 86400 } }
  );

  if (!res.ok) {
    // Fallback: try the latest rate
    const fallback = await fetch(
      `${FRANKFURTER_BASE}/latest?from=${currency}&to=EUR`
    );
    if (!fallback.ok) {
      throw new Error(`Cannot get exchange rate for ${currency} on ${dateStr}`);
    }
    const data = (await fallback.json()) as FrankfurterResponse;
    const rate = data.rates["EUR"];
    await prisma.exchangeRate.upsert({
      where: { date_currency: { date, currency } },
      update: { rateToEur: rate },
      create: { date, currency, rateToEur: rate },
    });
    return rate;
  }

  const data = (await res.json()) as FrankfurterResponse;
  const rate = data.rates["EUR"];

  await prisma.exchangeRate.upsert({
    where: { date_currency: { date, currency } },
    update: { rateToEur: rate },
    create: { date, currency, rateToEur: rate },
  });

  return rate;
}

export async function convertToEur(
  amount: number,
  currency: string,
  date: Date
): Promise<{ amountEur: number; rate: number }> {
  const rate = await getEurRateForDate(currency, date);
  return { amountEur: amount * rate, rate };
}
