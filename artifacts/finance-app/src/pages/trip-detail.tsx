import { useGetTripPnl, getGetTripPnlQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { formatAmount, currencyClass, cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, TrendingUp, TrendingDown, Divide } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import { ShareButton } from "@/components/share-button";
import { tr } from "@/lib/i18n";

function toPrimary(amount: number, currency: string, rates: Record<string, number>, primary: string): number {
  const inAed = currency === "AED" ? amount : amount * (rates[currency] ?? 1);
  if (primary === "AED") return inAed;
  return inAed / (rates[primary] ?? 1);
}

export default function TripDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id);

  const { settings } = useSettings();
  const { exchangeRateMode, manualRates, primaryCurrency, language } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data, isLoading } = useGetTripPnl(id, {
    query: { enabled: !!id, queryKey: getGetTripPnlQueryKey(id) },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="h-8 bg-muted rounded animate-pulse w-1/2" />
        <div className="h-40 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!data) return <div className="p-4 text-center text-muted-foreground">{t("tripNotFound")}</div>;

  const { trip, breakdown } = data;
  const rawTxs = (data as unknown as { transactions?: { date: string; type: string; description?: string | null; amount: number; currency: string }[] }).transactions ?? [];

  const apiRates = (data as unknown as { exchangeRates?: Record<string, number> }).exchangeRates as Record<string, number> | undefined;
  const effectiveRates: Record<string, number> = exchangeRateMode === "manual" ? manualRates : (apiRates ?? manualRates);

  const primaryTotal = Math.round(
    breakdown.reduce((sum, b) => sum + toPrimary(b.netProfit, b.currency, effectiveRates, primaryCurrency), 0) * 100
  ) / 100;

  const exportTotals = breakdown.map((b) => ({
    currency: b.currency,
    paid: b.expenses,
    received: b.revenue,
    openBalance: b.netProfit,
  }));

  const ChevronBack = language === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className={cn("p-4 space-y-5 max-w-2xl mx-auto pb-24 lg:pb-6", language === "ar" ? "text-right" : "text-left")}>
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => setLocation("/trips")} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
          <ChevronBack className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{trip.name}</h1>
            {trip.isShared && (
              <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                {t("shared")}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("profitLoss")}</p>
        </div>
        <ShareButton
          exportOptions={{
            title: trip.name,
            subtitle: t("profitLoss"),
            transactions: rawTxs.map((tx) => ({
              date: tx.date,
              type: tx.type,
              description: tx.description,
              amount: tx.amount,
              currency: tx.currency,
            })),
            totals: exportTotals,
            primaryCurrency,
            primaryTotal,
          }}
        />
      </div>

      {trip.isShared && (
        <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 rounded-xl px-4 py-3">
          <Divide className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
          <p className="text-sm text-purple-700 dark:text-purple-300">{t("sharedTripNote")}</p>
        </div>
      )}

      {breakdown.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <p className="text-muted-foreground">{t("noTripTransactions")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {breakdown.map((b) => (
            <div key={b.currency} className="bg-card border border-border rounded-2xl p-5 shadow-sm" data-testid={`pnl-${b.currency}`}>
              <div className="flex items-center justify-between mb-4">
                <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", currencyClass(b.currency))}>{b.currency}</span>
                <div className={language === "ar" ? "text-left" : "text-right"}>
                  <p className="text-xs text-muted-foreground">{t("netProfit")}</p>
                  <p className={cn("text-xl font-bold", b.netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                    {b.netProfit >= 0 ? "+" : ""}{formatAmount(b.netProfit, b.currency)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                    <span className="text-xs text-green-700 dark:text-green-400 font-medium">{t("revenue")}</span>
                  </div>
                  <p className="text-base font-bold text-green-700 dark:text-green-400">{formatAmount(b.revenue, b.currency)}</p>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-xs text-red-700 dark:text-red-400 font-medium">{t("expensesLabel")}</span>
                  </div>
                  <p className="text-base font-bold text-red-700 dark:text-red-400">{formatAmount(b.expenses, b.currency)}</p>
                </div>
              </div>

              {trip.isShared && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 rounded-xl p-3">
                  <p className="text-xs text-purple-600 font-medium mb-1">{t("myShare")}</p>
                  <p className={cn("text-lg font-bold", b.myShare >= 0 ? "text-purple-700" : "text-red-600")}>
                    {b.myShare >= 0 ? "+" : ""}{formatAmount(b.myShare, b.currency)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
