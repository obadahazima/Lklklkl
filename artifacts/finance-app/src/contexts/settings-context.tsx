import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import { customFetch } from "@workspace/api-client-react";

export type AppTheme = "light" | "dark";

export interface AppSettings {
  language: Lang;
  currencies: string[];
  primaryCurrency: string;
  exchangeRateMode: "auto" | "manual";
  manualRates: Record<string, number>;
  showClients: boolean;
  showTrips: boolean;
  showStudios: boolean;
  theme: AppTheme;
  autoBackup: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  language: "ar",
  currencies: ["AED", "USD", "SYP"],
  primaryCurrency: "AED",
  exchangeRateMode: "auto",
  manualRates: { AED: 1, USD: 3.67, SYP: 0.000282, EUR: 4.02, GBP: 4.69, SAR: 0.978, TRY: 0.108, LBP: 0.000041, JOD: 5.17, IQD: 0.00281, EGP: 0.073, KWD: 12.0, QAR: 1.007 },
  showClients: false,
  showTrips: false,
  showStudios: false,
  theme: "light",
  autoBackup: true,
};

const STORAGE_KEY = "hisabat_settings";

const KNOWN_WRONG_RATES: Record<string, { maxCorrect: number; correct: number }> = {
  SYP: { maxCorrect: 0.01, correct: 0.000282 },
  LBP: { maxCorrect: 0.001, correct: 0.000041 },
};

function correctRates(rates: Record<string, number>): Record<string, number> {
  const fixed = { ...rates, AED: 1 };
  for (const [code, { maxCorrect, correct }] of Object.entries(KNOWN_WRONG_RATES)) {
    if (fixed[code] !== undefined && fixed[code] > maxCorrect) {
      fixed[code] = correct;
    }
  }
  return fixed;
}

function parseSettings(raw: Partial<AppSettings>): AppSettings {
  return {
    language: raw.language ?? DEFAULT_SETTINGS.language,
    currencies: Array.isArray(raw.currencies) && raw.currencies.length > 0
      ? raw.currencies.slice(0, 5)
      : DEFAULT_SETTINGS.currencies,
    primaryCurrency: raw.primaryCurrency ?? DEFAULT_SETTINGS.primaryCurrency,
    exchangeRateMode: raw.exchangeRateMode ?? DEFAULT_SETTINGS.exchangeRateMode,
    manualRates: correctRates(raw.manualRates ?? DEFAULT_SETTINGS.manualRates),
    showClients: raw.showClients ?? DEFAULT_SETTINGS.showClients,
    showTrips: raw.showTrips ?? DEFAULT_SETTINGS.showTrips,
    showStudios: raw.showStudios ?? DEFAULT_SETTINGS.showStudios,
    theme: raw.theme ?? DEFAULT_SETTINGS.theme,
    autoBackup: raw.autoBackup ?? DEFAULT_SETTINGS.autoBackup,
  };
}

function loadLocalSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return parseSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function fetchRemoteSettings(): Promise<AppSettings | null> {
  try {
    const data = await customFetch<AppSettings | null>("/api/settings", { credentials: "include" });
    if (!data) return null;
    return parseSettings(data as Partial<AppSettings>);
  } catch {
    return null;
  }
}

async function pushRemoteSettings(s: AppSettings) {
  try {
    await customFetch<{ ok: boolean }>("/api/settings", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
  } catch {}
}
interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  effectiveRates: Record<string, number>;
  liveRatesLoading: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  effectiveRates: DEFAULT_SETTINGS.manualRates,
  liveRatesLoading: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadLocalSettings);
  const [liveRates, setLiveRates] = useState<Record<string, number> | null>(null);
  const [liveRatesLoading, setLiveRatesLoading] = useState(false);
  const fetchingRef = useRef(false);
  const syncedRef = useRef(false);

 const fetchRates = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLiveRatesLoading(true);
    try {
      const data = await customFetch<Record<string, number>>(`/api/exchange-rates?base=${settings.primaryCurrency}`, { credentials: "include" });
      setLiveRates({ ...data, AED: 1 });
    } catch {
    } finally {
      setLiveRatesLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (settings.exchangeRateMode !== "auto") {
      setLiveRates(null);
      return;
    }
    fetchRates();
    function onVisible() {
      if (document.visibilityState === "visible") fetchRates();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [settings.exchangeRateMode, fetchRates]);

  useEffect(() => {
    const lang = settings.language;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [settings.language]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
  }, [settings.theme]);

  useEffect(() => {
    if (syncedRef.current) return;
    fetchRemoteSettings().then((remote) => {
      if (!remote) return;
      syncedRef.current = true;
      setSettings((local) => {
        const merged = remote;
        saveLocal(merged);
        return merged;
      });
    });
  }, []);

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((prev) => {
      let next = { ...prev, ...patch };

      if (
        patch.exchangeRateMode === "manual" &&
        prev.exchangeRateMode === "auto" &&
        liveRates
      ) {
        next = { ...next, manualRates: { ...liveRates } };
      }

      saveLocal(next);
      pushRemoteSettings(next);
      return next;
    });
  }

  const effectiveRates: Record<string, number> =
    settings.exchangeRateMode === "auto" && liveRates
      ? liveRates
      : settings.manualRates;

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, effectiveRates, liveRatesLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export function convertToPrimary(
  amountAed: number,
  primaryCurrency: string,
  rates: Record<string, number>
): number {
  if (primaryCurrency === "AED") return amountAed;
  const primaryRate = rates[primaryCurrency];
  if (!primaryRate || primaryRate === 0) return amountAed;
  return amountAed / primaryRate;
}

export function toAedFrontend(
  amount: number,
  currency: string,
  rates: Record<string, number>
): number {
  if (currency === "AED") return amount;
  return amount * (rates[currency] ?? 1);
}

export const CURRENCY_UNITS: Record<string, number> = {
  SYP: 10000,
  LBP: 100000,
  IQD: 1000,
};

export function getRateUnit(code: string): number {
  return CURRENCY_UNITS[code] ?? 1;
}

export function rateToDisplay(code: string, rateAed: number): number {
  return rateAed * getRateUnit(code);
}

export function displayToRate(code: string, displayVal: number): number {
  return displayVal / getRateUnit(code);
}
