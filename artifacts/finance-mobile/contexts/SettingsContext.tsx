import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

const STORAGE_KEY = "finance_app_settings";

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

export type AppTheme = "light" | "dark";

export interface AppSettings {
  language: "ar" | "en";
  currencies: string[];
  primaryCurrency: string;
  exchangeRateMode: "auto" | "manual";
  manualRates: Record<string, number>;
  showClients: boolean;
  showTrips: boolean;
  showStudios: boolean;
  theme: AppTheme;
}

const defaultSettings: AppSettings = {
  language: "ar",
  currencies: ["AED", "USD", "SYP"],
  primaryCurrency: "AED",
  exchangeRateMode: "auto",
  manualRates: { AED: 1, USD: 3.67, SYP: 0.000282, EUR: 4.02, GBP: 4.69, SAR: 0.978, TRY: 0.108, LBP: 0.000041, JOD: 5.17, IQD: 0.00281, EGP: 0.073, KWD: 12.0, QAR: 1.007 },
  showClients: true,
  showTrips: true,
  showStudios: true,
  theme: "light",
};

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  effectiveRates: Record<string, number>;
  liveRatesLoading: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: defaultSettings,
  updateSettings: () => {},
  effectiveRates: defaultSettings.manualRates,
  liveRatesLoading: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [liveRates, setLiveRates] = useState<Record<string, number> | null>(null);
  const [liveRatesLoading, setLiveRatesLoading] = useState(false);
  const fetchingRef = useRef(false);
  const modeRef = useRef(defaultSettings.exchangeRateMode);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val) as Partial<AppSettings>;
          const loaded: AppSettings = {
            language: parsed.language ?? defaultSettings.language,
            currencies: Array.isArray(parsed.currencies) && parsed.currencies.length > 0
              ? parsed.currencies.slice(0, 5)
              : defaultSettings.currencies,
            primaryCurrency: parsed.primaryCurrency ?? defaultSettings.primaryCurrency,
            exchangeRateMode: parsed.exchangeRateMode ?? defaultSettings.exchangeRateMode,
            manualRates: correctRates(parsed.manualRates ?? defaultSettings.manualRates),
            showClients: parsed.showClients ?? defaultSettings.showClients,
            showTrips: parsed.showTrips ?? defaultSettings.showTrips,
            showStudios: parsed.showStudios ?? defaultSettings.showStudios,
            theme: parsed.theme ?? defaultSettings.theme,
          };
          modeRef.current = loaded.exchangeRateMode;
          setSettings(loaded);
        } catch {}
      }
    });
  }, []);

  const fetchRates = useCallback(async () => {
    if (fetchingRef.current) return;
    if (modeRef.current !== "auto") return;
    fetchingRef.current = true;
    setLiveRatesLoading(true);
    try {
      const domain = process.env.EXPO_PUBLIC_DOMAIN;
      if (!domain) return;
      const res = await fetch(`https://${domain}/api/exchange-rates`);
      if (res.ok) {
        const data = await res.json() as Record<string, number>;
        setLiveRates({ ...data, AED: 1 });
      }
    } catch {
    } finally {
      setLiveRatesLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    modeRef.current = settings.exchangeRateMode;
    if (settings.exchangeRateMode !== "auto") {
      setLiveRates(null);
      return;
    }
    fetchRates();

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") fetchRates();
    });
    return () => sub.remove();
  }, [settings.exchangeRateMode, fetchRates]);

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

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

export const AVAILABLE_CURRENCIES = [
  { code: "AED", nameAr: "درهم إماراتي", nameEn: "UAE Dirham", symbol: "د.إ" },
  { code: "USD", nameAr: "دولار أمريكي", nameEn: "US Dollar", symbol: "$" },
  { code: "SYP", nameAr: "ليرة سورية", nameEn: "Syrian Pound", symbol: "ل.س" },
  { code: "EUR", nameAr: "يورو", nameEn: "Euro", symbol: "€" },
  { code: "GBP", nameAr: "جنيه إسترليني", nameEn: "British Pound", symbol: "£" },
  { code: "SAR", nameAr: "ريال سعودي", nameEn: "Saudi Riyal", symbol: "ر.س" },
  { code: "TRY", nameAr: "ليرة تركية", nameEn: "Turkish Lira", symbol: "₺" },
  { code: "LBP", nameAr: "ليرة لبنانية", nameEn: "Lebanese Pound", symbol: "ل.ل" },
  { code: "JOD", nameAr: "دينار أردني", nameEn: "Jordanian Dinar", symbol: "د.أ" },
  { code: "IQD", nameAr: "دينار عراقي", nameEn: "Iraqi Dinar", symbol: "د.ع" },
  { code: "EGP", nameAr: "جنيه مصري", nameEn: "Egyptian Pound", symbol: "ج.م" },
  { code: "KWD", nameAr: "دينار كويتي", nameEn: "Kuwaiti Dinar", symbol: "د.ك" },
  { code: "QAR", nameAr: "ريال قطري", nameEn: "Qatari Riyal", symbol: "ر.ق" },
];

export function getCurrencySymbol(code: string): string {
  return AVAILABLE_CURRENCIES.find((c) => c.code === code)?.symbol ?? code;
}

export function getCurrencyName(code: string, lang: "ar" | "en"): string {
  const c = AVAILABLE_CURRENCIES.find((x) => x.code === code);
  if (!c) return code;
  return lang === "ar" ? (c as any).nameAr : c.nameEn;
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
