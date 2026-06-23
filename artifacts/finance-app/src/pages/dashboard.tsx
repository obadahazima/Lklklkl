import { useGetDashboardSummary, useGetRecentTransactions } from "@workspace/api-client-react";
import { formatAmount, currencyClass, typeLabel, typeClass, statusLabel, statusClass, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Wallet, Users, Route, Clock, ArrowLeftRight, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import { useSettings, convertToPrimary, toAedFrontend, getRateUnit, rateToDisplay } from "@/contexts/settings-context";
import { tr, getCurrencySymbol } from "@/lib/i18n";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: recent, isLoading: loadingRecent } = useGetRecentTransactions();
  const { settings, effectiveRates } = useSettings();
  const { language, currencies: activeCurrencies, primaryCurrency, exchangeRateMode } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const totalInAED = summary
    ? (summary.currencies ?? []).reduce((sum, c) => sum + toAedFrontend(c.balance, c.currency, effectiveRates), 0)
    : 0;

  const totalInPrimary = convertToPrimary(totalInAED, primaryCurrency, effectiveRates);
  const primarySymbol = getCurrencySymbol(primaryCurrency);

  const shownCurrencies = (summary?.currencies ?? []).filter(
    (c) => activeCurrencies.includes(c.currency) && (c.totalIncome > 0 || c.totalExpenses > 0)
  );

  const primaryRate = effectiveRates[primaryCurrency] ?? 1;

  return (
    <div className="p-4 space-y-5 max-w-2xl mx-auto pb-24 lg:pb-6">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {language === "ar" ? "نظرة عامة على حساباتك" : "Overview of your accounts"}
        </p>
      </div>

      {/* ── Total Wallet Card ── */}
      {loadingSummary ? (
        <div className="h-28 bg-card rounded-2xl border border-border animate-pulse" />
      ) : summary ? (
        <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <span className="font-bold text-foreground">{t("totalWallet")}</span>
            </div>
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {primaryCurrency}
            </span>
          </div>
          <p
            className={cn(
              "text-3xl font-bold mt-1",
              totalInPrimary >= 0 ? "text-green-600" : "text-red-600"
            )}
            data-testid="total-balance-aed"
          >
            {totalInPrimary < 0 ? "-" : ""}
            {formatAmount(Math.abs(totalInPrimary), primaryCurrency)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {totalInPrimary >= 0 ? t("youAreOwed") : t("youOwe")}
          </p>

          {/* Exchange rate display */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-primary/10">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
              <span className="text-[10px] font-medium uppercase">
                {exchangeRateMode === "auto" ? t("automatic") : t("manual")}
              </span>
            </div>
            {activeCurrencies.filter((c) => c !== "AED").map((code) => {
              const rate = effectiveRates[code];
              if (!rate) return null;
              const unit = getRateUnit(code);
              const display = rateToDisplay(code, rate);
              const label = unit > 1 ? `${unit.toLocaleString()} ${code}` : `1 ${code}`;
              return (
                <span key={code} className="text-xs text-muted-foreground">
                  {label} = {display.toFixed(unit > 1 ? 2 : 4)} AED
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Currency breakdown */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {t("balanceDetails")}
        </h2>
        {loadingSummary ? (
          <div className="grid grid-cols-1 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-card rounded-2xl border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {shownCurrencies.map((c) => {
              const balanceInAed = toAedFrontend(c.balance, c.currency, effectiveRates);
              const balanceInPrimary = convertToPrimary(balanceInAed, primaryCurrency, effectiveRates);
              return (
                <div
                  key={c.currency}
                  className="bg-card border border-border rounded-2xl p-4 shadow-sm"
                  data-testid={`card-currency-${c.currency}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", currencyClass(c.currency))}>
                      {c.currency}
                    </span>
                    <div className="text-end">
                      <p className={cn("text-xl font-bold", c.balance >= 0 ? "text-green-600" : "text-red-600")}>
                        {c.balance < 0 ? "-" : ""}
                        {formatAmount(Math.abs(c.balance), c.currency)}
                      </p>
                      {primaryCurrency !== c.currency && (
                        <p className="text-xs text-muted-foreground">
                          ≈ {formatAmount(Math.abs(balanceInPrimary), primaryCurrency)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs text-muted-foreground">{t("income")}:</span>
                      <span className="text-xs font-semibold text-green-600">{formatAmount(c.totalIncome, c.currency)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-xs text-muted-foreground">{t("expense")}:</span>
                      <span className="text-xs font-semibold text-red-600">{formatAmount(c.totalExpenses, c.currency)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {shownCurrencies.length === 0 && (
              <div className="bg-card border border-border rounded-2xl p-6 text-center">
                <Wallet className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">{t("noTransactions")}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Stats row */}
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-xl p-3 text-center" data-testid="stat-clients">
            <Users className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{summary.totalClients}</p>
            <p className="text-xs text-muted-foreground">{t("clientsCount")}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center" data-testid="stat-active-trips">
            <Route className="w-5 h-5 text-blue-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{summary.activeTrips}</p>
            <p className="text-xs text-muted-foreground">{t("activeTrips")}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center" data-testid="stat-pending">
            <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold text-foreground">{summary.pendingTransactions}</p>
            <p className="text-xs text-muted-foreground">{t("pending")}</p>
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("recentTransactions")}
          </h2>
          <Link href="/transactions">
            <span className="text-xs text-primary font-medium">{t("viewAll")}</span>
          </Link>
        </div>
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          {loadingRecent ? (
            <div className="divide-y divide-border">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 animate-pulse">
                  <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : recent?.length === 0 ? (
            <div className="p-8 text-center">
              <ArrowLeftRight className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">{t("noTransactions")}</p>
              <Link href="/transactions/new">
                <span className="text-primary text-sm font-medium">{t("addTransactionPrompt")}</span>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent?.map((tx) => (
                <div key={tx.id} className="p-4 flex items-center gap-3" data-testid={`tx-row-${tx.id}`}>
                  <div
                    className={cn("w-2 h-2 rounded-full shrink-0 mt-0.5", {
                      "bg-green-500": tx.type === "income",
                      "bg-red-500": tx.type === "expense",
                      "bg-blue-500": tx.type === "payment",
                      "bg-emerald-500": tx.type === "receipt",
                    })}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn("text-sm font-semibold", typeClass(tx.type))}>
                        {typeLabel(tx.type, language)}
                      </span>
                      {tx.clientName && (
                        <span className="text-xs text-muted-foreground truncate">{tx.clientName}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDate(tx.date, language)}</span>
                      {tx.tripName && (
                        <span className="text-xs text-blue-500 truncate">{tx.tripName}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <p className={cn("text-sm font-bold", typeClass(tx.type))}>
                      {tx.type === "expense" || tx.type === "payment" ? "-" : "+"}
                      {formatAmount(tx.amount, tx.currency)}
                    </p>
                    {tx.currency !== primaryCurrency && (() => {
                      const inAed = tx.currency === "AED" ? tx.amount : tx.amount * (effectiveRates[tx.currency] ?? 1);
                      const inPrimary = primaryCurrency === "AED" ? inAed : inAed / (effectiveRates[primaryCurrency] ?? 1);
                      return (
                        <p className="text-[10px] text-muted-foreground mb-0.5">
                          ≈ {formatAmount(inPrimary, primaryCurrency)}
                        </p>
                      );
                    })()}
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", statusClass(tx.status))}>
                      {statusLabel(tx.status, language)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
