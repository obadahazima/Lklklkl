import { useState, useEffect, useRef } from "react";
import { useSettings } from "@/contexts/settings-context";
import { tr, AVAILABLE_CURRENCIES, getCurrencyName } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Check, Globe, Coins, Star, RefreshCw, ChevronDown, X, Plus, LayoutList, Sun, Moon, Download, Upload, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const AUTO_BACKUP_KEY = "hisabat_last_auto_backup";
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

const MAX_CURRENCIES = 5;

export default function Settings() {
  const { settings, updateSettings } = useSettings();
  const { language, currencies, primaryCurrency, exchangeRateMode, manualRates, showClients, showTrips, showStudios, theme } = settings;
  const { toast } = useToast();
  const t = (k: Parameters<typeof tr>[1], vars?: Record<string, string>) => tr(language, k, vars);

  const [localRates, setLocalRates] = useState<Record<string, number>>({ ...manualRates });
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [lastAutoBackup, setLastAutoBackup] = useState<string | null>(() => localStorage.getItem(AUTO_BACKUP_KEY));
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const autoBackupRunningRef = useRef(false);

  const triggerBackupDownload = async (silent = false) => {
    if (autoBackupRunningRef.current) return;
    autoBackupRunningRef.current = true;
    try {
      const res = await fetch("/api/backup", { credentials: "include" });
      if (!res.ok) throw new Error("failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      const now = new Date().toISOString();
      localStorage.setItem(AUTO_BACKUP_KEY, now);
      setLastAutoBackup(now);
      if (!silent) toast({ title: language === "ar" ? "تم تحميل النسخة الاحتياطية ✓" : "Backup downloaded ✓" });
    } catch {
      if (!silent) toast({ title: language === "ar" ? "فشل تحميل النسخة الاحتياطية" : "Backup failed", variant: "destructive" });
    } finally {
      autoBackupRunningRef.current = false;
    }
  };

  async function handleBackup() {
    setBackupLoading(true);
    try {
      await triggerBackupDownload(false);
    } finally {
      setBackupLoading(false);
    }
  }

  useEffect(() => {
    if (!settings.autoBackup) return;
    const check = () => {
      const last = lastAutoBackup ? new Date(lastAutoBackup).getTime() : 0;
      if (Date.now() - last >= BACKUP_INTERVAL_MS) {
        triggerBackupDownload(true);
      }
    };
    check();
    const interval = setInterval(check, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [settings.autoBackup, lastAutoBackup]);

  async function handleRestore(file: File) {
    setRestoreLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/restore", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) throw new Error("failed");
      const data = await res.json() as { restored: Record<string, number> };
      const r = data.restored;
      const msg = language === "ar"
        ? `تمت الاستعادة ✓ — ${r.clients} زبون، ${r.trips} رحلة، ${r.studios} استديو، ${r.transactions} معاملة`
        : `Restored ✓ — ${r.clients} clients, ${r.trips} trips, ${r.studios} studios, ${r.transactions} transactions`;
      toast({ title: msg });
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      toast({ title: language === "ar" ? "فشل استعادة النسخة الاحتياطية" : "Restore failed", variant: "destructive" });
    } finally {
      setRestoreLoading(false);
    }
  }

  const availableToAdd = AVAILABLE_CURRENCIES.filter((c) => !currencies.includes(c.code));

  function handleSaveRates() {
    updateSettings({ manualRates: { ...localRates, AED: 1 } });
    toast({ title: t("settingsSaved") });
  }

  // Show all active currencies except the primary — format: "1 PRIMARY = X CODE"
  const rateInputCurrencies = currencies.filter((c) => c !== primaryCurrency);

  function getDisplayVal(code: string): string {
    const primRate = primaryCurrency === "AED" ? 1 : (localRates[primaryCurrency] ?? 1);
    const codeRate = code === "AED" ? 1 : (localRates[code] ?? 0);
    if (codeRate <= 0) return "";
    const val = primRate / codeRate;
    // format: avoid too many decimals, but keep enough precision
    if (val >= 1000) return String(Math.round(val));
    if (val >= 1) return String(+val.toFixed(2));
    return String(+val.toFixed(4));
  }

  function handleRateChange(code: string, raw: string) {
    const displayVal = parseFloat(raw);
    if (!displayVal || displayVal <= 0) return;
    setLocalRates((prev) => {
      const primRate = primaryCurrency === "AED" ? 1 : (prev[primaryCurrency] ?? 1);
      if (code === "AED") {
        // "1 PRIMARY = X AED" → rates[PRIMARY] = X
        return { ...prev, [primaryCurrency]: displayVal };
      }
      return { ...prev, [code]: primRate / displayVal };
    });
  }

  function removeCurrency(code: string) {
    if (currencies.length <= 1) return;
    const next = currencies.filter((c) => c !== code);
    const newPrimary = next.includes(primaryCurrency) ? primaryCurrency : next[0];
    updateSettings({ currencies: next, primaryCurrency: newPrimary });
  }

  function addCurrency(code: string) {
    if (currencies.length >= MAX_CURRENCIES) return;
    updateSettings({ currencies: [...currencies, code] });
    setShowCurrencyPicker(false);
  }

  return (
    <div className={cn("p-4 max-w-xl mx-auto pb-24 lg:pb-6 space-y-6", language === "en" ? "text-left" : "text-right")}>
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">{t("settingsTitle")}</h1>
      </div>

      {/* ── Theme ── */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          {theme === "dark" ? <Moon className="w-4 h-4 text-primary shrink-0" /> : <Sun className="w-4 h-4 text-primary shrink-0" />}
          <span className="font-semibold text-foreground text-sm">{language === "ar" ? "المظهر" : "Appearance"}</span>
        </div>
        <div className="flex p-3 gap-3">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => updateSettings({ theme: t })}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-all flex items-center justify-center gap-2",
                theme === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/50"
              )}
            >
              {t === "light" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              {t === "light" ? (language === "ar" ? "نهاري" : "Light") : (language === "ar" ? "ليلي" : "Dark")}
            </button>
          ))}
        </div>
      </section>

      {/* ── Language ── */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Globe className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground text-sm">{t("language")}</span>
        </div>
        <div className="flex p-3 gap-3">
          {(["ar", "en"] as const).map((lang) => (
            <button
              key={lang}
              onClick={() => updateSettings({ language: lang })}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-all",
                language === lang
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/50"
              )}
            >
              <Check className={cn("w-3.5 h-3.5 inline me-1.5", language === lang ? "opacity-100" : "opacity-0")} />
              {lang === "ar" ? t("arabic") : t("english")}
            </button>
          ))}
        </div>
      </section>

      {/* ── Currencies ── */}
      <section className="bg-card border border-border rounded-2xl shadow-sm overflow-visible">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Coins className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-foreground text-sm">{t("currencies")}</span>
            <p className="text-xs text-muted-foreground">{t("currenciesDesc")}</p>
          </div>
        </div>
        <div className="p-3 space-y-2">
          {currencies.map((code) => (
            <div key={code} className="flex items-center justify-between bg-background border border-border rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{code}</span>
                <span className="text-sm text-foreground">{getCurrencyName(code, language)}</span>
              </div>
              {currencies.length > 1 && (
                <button
                  onClick={() => removeCurrency(code)}
                  className="text-muted-foreground hover:text-red-500 transition-colors p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {currencies.length < MAX_CURRENCIES ? (
            <div>
              <button
                onClick={() => setShowCurrencyPicker(!showCurrencyPicker)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-xl py-2.5 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("addCurrency")}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showCurrencyPicker && "rotate-180")} />
              </button>
              {showCurrencyPicker && (
                <div className="mt-2 border border-border rounded-xl bg-background overflow-hidden">
                  {availableToAdd.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">{t("noCurrencyLeft")}</p>
                  ) : (
                    availableToAdd.map((c) => (
                      <button
                        key={c.code}
                        onClick={() => addCurrency(c.code)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-start border-b border-border last:border-b-0"
                      >
                        <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{c.code}</span>
                        <span className="text-sm">{c.name[language]}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-600 text-center py-1">{t("maxCurrencies")}</p>
          )}
        </div>
      </section>

      {/* ── Primary Currency ── */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Star className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-foreground text-sm">{t("primaryCurrency")}</span>
            <p className="text-xs text-muted-foreground">{t("primaryCurrencyDesc")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 p-3">
          {currencies.map((code) => (
            <button
              key={code}
              onClick={() => updateSettings({ primaryCurrency: code })}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all",
                primaryCurrency === code
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/50"
              )}
            >
              {primaryCurrency === code && <Check className="w-3.5 h-3.5" />}
              {code}
            </button>
          ))}
        </div>
      </section>

      {/* ── Sections Visibility ── */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <LayoutList className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-foreground text-sm">
              {language === "ar" ? "أقسام التطبيق" : "App Sections"}
            </span>
            <p className="text-xs text-muted-foreground">
              {language === "ar" ? "إظهار أو إخفاء أقسام من القائمة" : "Show or hide sections from the menu"}
            </p>
          </div>
        </div>
        <div className="divide-y divide-border">
          {[
            { key: "showClients" as const, value: showClients, labelAr: "الزبائن", labelEn: "Clients" },
            { key: "showTrips" as const, value: showTrips, labelAr: "الرحلات", labelEn: "Trips" },
            { key: "showStudios" as const, value: showStudios, labelAr: "الاستديوهات", labelEn: "Studios" },
          ].map(({ key, value, labelAr, labelEn }) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-foreground">
                {language === "ar" ? labelAr : labelEn}
              </span>
              <button
                onClick={() => updateSettings({ [key]: !value })}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                  value ? "bg-primary" : "bg-muted"
                )}
                role="switch"
                aria-checked={value}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                    value ? (language === "ar" ? "-translate-x-6" : "translate-x-6") : (language === "ar" ? "-translate-x-1" : "translate-x-1")
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Exchange Rate Mode ── */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <RefreshCw className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground text-sm">{t("exchangeRateMode")}</span>
        </div>
        <div className="flex p-3 gap-3">
          {(["auto", "manual"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => updateSettings({ exchangeRateMode: mode })}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border transition-all",
                exchangeRateMode === mode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/50"
              )}
            >
              <Check className={cn("w-3.5 h-3.5 inline me-1.5", exchangeRateMode === mode ? "opacity-100" : "opacity-0")} />
              {mode === "auto" ? t("automatic") : t("manual")}
            </button>
          ))}
        </div>

        <div className="px-4 pb-4">
          {exchangeRateMode === "auto" ? (
            <p className="text-xs text-muted-foreground text-center py-1">{t("autoRateDesc")}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {language === "ar"
                  ? `أدخل قيمة 1 ${primaryCurrency} مقابل كل عملة`
                  : `Enter how much 1 ${primaryCurrency} equals in each currency`}
              </p>
              {rateInputCurrencies.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {language === "ar"
                    ? "أضف عملات أخرى غير العملة الأساسية لضبط أسعارها"
                    : "Add currencies other than your primary to set their rates"}
                </p>
              )}
              {rateInputCurrencies.map((code) => {
                const displayVal = getDisplayVal(code);
                return (
                  <div key={code} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground w-24 shrink-0 text-start">
                      1 {primaryCurrency} =
                    </span>
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={displayVal}
                        onChange={(e) => handleRateChange(code, e.target.value)}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="0"
                      />
                      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                        {code}
                      </span>
                    </div>
                  </div>
                );
              })}
              {rateInputCurrencies.length > 0 && (
                <button
                  onClick={handleSaveRates}
                  className="w-full bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold mt-1 hover:bg-primary/90 transition-colors"
                >
                  {t("save")}
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Backup ── */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Download className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-foreground text-sm">
              {language === "ar" ? "النسخة الاحتياطية" : "Backup"}
            </span>
            <p className="text-xs text-muted-foreground">
              {language === "ar" ? "تحميل كل بياناتك كملف Excel" : "Download all your data as Excel file"}
            </p>
          </div>
        </div>
        <div className="p-3 space-y-3">
          {/* Auto backup toggle */}
          <div className="flex items-center justify-between bg-background border border-border rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {language === "ar" ? "نسخ تلقائي كل 24 ساعة" : "Auto backup every 24h"}
                </p>
                {settings.autoBackup && lastAutoBackup && (
                  <p className="text-xs text-muted-foreground">
                    {language === "ar" ? "آخر نسخة: " : "Last: "}
                    {new Date(lastAutoBackup).toLocaleString(language === "ar" ? "ar-AE" : "en-AE")}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => updateSettings({ autoBackup: !settings.autoBackup })}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none shrink-0",
                settings.autoBackup ? "bg-primary" : "bg-muted"
              )}
              role="switch"
              aria-checked={settings.autoBackup}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                settings.autoBackup
                  ? (language === "ar" ? "-translate-x-6" : "translate-x-6")
                  : (language === "ar" ? "-translate-x-1" : "translate-x-1")
              )} />
            </button>
          </div>

          {/* Manual backup button */}
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all",
              backupLoading
                ? "opacity-50 cursor-not-allowed bg-muted border-border text-muted-foreground"
                : "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
            )}
          >
            <Download className="w-4 h-4" />
            {backupLoading
              ? (language === "ar" ? "جارٍ التحضير..." : "Preparing...")
              : (language === "ar" ? "تحميل نسخة احتياطية الآن (.xlsx)" : "Download Backup Now (.xlsx)")}
          </button>
          <p className="text-xs text-muted-foreground text-center">
            {language === "ar"
              ? "يشمل: المعاملات، الزبائن، الرحلات، الاستديوهات"
              : "Includes: Transactions, Clients, Trips, Studios"}
          </p>
        </div>
      </section>

      {/* ── Restore ── */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Upload className="w-4 h-4 text-primary shrink-0" />
          <div className="flex-1">
            <span className="font-semibold text-foreground text-sm">
              {language === "ar" ? "استعادة البيانات" : "Restore Data"}
            </span>
            <p className="text-xs text-muted-foreground">
              {language === "ar"
                ? "ارفع ملف نسخة احتياطية سابقة لاستعادة بياناتك"
                : "Upload a previous backup file to restore your data"}
            </p>
          </div>
        </div>
        <div className="p-3 space-y-2">
          <input
            ref={restoreInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleRestore(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => restoreInputRef.current?.click()}
            disabled={restoreLoading}
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold border transition-all",
              restoreLoading
                ? "opacity-50 cursor-not-allowed bg-muted border-border text-muted-foreground"
                : "bg-background text-foreground border-border hover:border-primary/50 hover:text-primary"
            )}
          >
            <Upload className="w-4 h-4" />
            {restoreLoading
              ? (language === "ar" ? "جارٍ الاستعادة..." : "Restoring...")
              : (language === "ar" ? "رفع ملف الاستعادة (.xlsx)" : "Upload Backup File (.xlsx)")}
          </button>
          <p className="text-xs text-amber-600 text-center">
            {language === "ar"
              ? "⚠️ ستُضاف البيانات إلى حسابك الحالي"
              : "⚠️ Data will be added to your current account"}
          </p>
        </div>
      </section>
    </div>
  );
}
