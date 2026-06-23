export type AllRates = Record<string, number>;

const FALLBACK_RATES: AllRates = {
  AED: 1,
  USD: 3.67,
  SYP: 0.000282,
  EUR: 4.02,
  GBP: 4.69,
  SAR: 0.978,
  TRY: 0.108,
  LBP: 0.000041,
  JOD: 5.17,
  IQD: 0.00281,
  EGP: 0.073,
  KWD: 12.0,
  QAR: 1.007,
};

let cache: { rates: AllRates; fetchedAt: number } | null = null;
const CACHE_TTL = 10 * 60 * 1000;

export async function getExchangeRates(): Promise<AllRates> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL) return cache.rates;
  try {
    const resp = await fetch("https://open.er-api.com/v6/latest/AED");
    const data = (await resp.json()) as { result: string; rates: Record<string, number> };
    if (data.result === "success" && data.rates) {
      const rates: AllRates = { AED: 1 };
      for (const [code, rateFromAed] of Object.entries(data.rates)) {
        if (rateFromAed > 0) rates[code] = 1 / rateFromAed;
      }
      rates.AED = 1;
      cache = { rates, fetchedAt: Date.now() };
      return rates;
    }
  } catch {
    // fall through to fallback
  }
  return { ...FALLBACK_RATES };
}

export function toAed(amount: number, currency: string, rates: AllRates): number {
  if (currency === "AED") return amount;
  return amount * (rates[currency] ?? 1);
}
