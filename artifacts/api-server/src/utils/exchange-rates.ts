import { db } from "@workspace/db";
import { userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
  const rate = rates[currency];
  if (rate == null) {
    // Silently falling back to 1 (i.e. treating this currency as if it were AED) would produce
    // a wrong total with no indication anything was off. Surface it in the logs at least, since
    // this route has no per-request logger here.
    console.warn(`[exchange-rates] No rate found for currency "${currency}" — treating as 1:1 with AED, totals may be inaccurate.`);
    return amount;
  }
  return amount * rate;
}

/**
 * Returns the rates that should actually be used for THIS user's money math — respecting the
 * exchange-rate mode they picked in Settings (mirrors the web/mobile settings context):
 *   - "manual": the user typed in their own fixed rates (settings.manualRates) — use those as-is,
 *     never override them with a live lookup, since the whole point of manual mode is that the
 *     user doesn't want the numbers moving day to day.
 *   - "auto" (or no settings saved yet): fall back to the live, cached exchange rate (getExchangeRates()).
 * Same AED-pivot convention as getExchangeRates(): rates[code] = how many AED one unit of `code` is worth.
 */
export async function getEffectiveRates(userId: string): Promise<AllRates> {
  try {
    const rows = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
    const settings = rows[0]?.settings as { exchangeRateMode?: string; manualRates?: Record<string, number> } | undefined;
    if (settings?.exchangeRateMode === "manual" && settings.manualRates && typeof settings.manualRates === "object") {
      return { AED: 1, ...settings.manualRates };
    }
  } catch {
    // If the settings lookup itself fails for some reason, don't let that break balance
    // calculations — just fall through to the live/auto rates below.
  }
  return getExchangeRates();
}
