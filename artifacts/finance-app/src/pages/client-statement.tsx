import { useGetClientStatement, getGetClientStatementQueryKey } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { formatAmount, currencyClass, typeLabel, typeClass, statusLabel, statusClass, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ChevronRight, TrendingDown, TrendingUp, Minus, Wallet, RefreshCw } from "lucide-react";
import { useSettings } from "@/contexts/settings-context";
import { tr, getCurrencySymbol } from "@/lib/i18n";
import { ShareButton } from "@/components/share-button";

function toPrimary(
  amount: number,
  currency: string,
  rates: Record<string, number>,
  primary: string
): number {
  const inAed = currency === "AED" ? amount : amount * (rates[currency] ?? 1);
  if (primary === "AED") return inAed;
  return inAed / (rates[primary] ?? 1);
}

export default function ClientStatement() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id);

  const { settings } = useSettings();
  const { language, exchangeRateMode, manualRates, primaryCurrency } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data, isLoading } = useGetClientStatement(id, {
    query: { enabled: !!id, queryKey: getGetClientStatementQueryKey(id) },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="h-8 bg-muted rounded animate-pulse w-1/3" />
        <div className="h-28 bg-muted rounded-2xl animate-pulse" />
        <div className="h-40 bg-muted rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!data) return <div className="p-4 text-center text-muted-foreground">لم يتم العثور على الزبون</div>;

  const { client, transactions, balances } = data;
  const apiRates = data.exchangeRates as Record<string, number> | undefined;
  const effectiveRates: Record<string, number> = exchangeRateMode === "manual" ? manualRates : (apiRates ?? manualRates);

  const totalInPrimary = Math.round(
    balances.reduce((sum, b) => sum + toPrimary(b.openBalance, b.currency, effectiveRates, primaryCurrency), 0) * 100
  ) / 100;

  const primarySym = getCurrencySymbol(primaryCurrency);
  const hasNonPrimary = balances.some((b) => b.currency !== primaryCurrency);

  return (
    <div className={cn("p-4 space-y-5 max-w-2xl mx-auto pb-24 lg:pb-6", language === "en" ? "text-left" : "text-right")}>
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => setLocation("/clients")}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
        >
          <ChevronRight className={cn("w-5 h-5", language === "ar" && "rotate-180")} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {client.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-bold">{client.name}</h1>
              <p className="text-xs text-muted-foreground">{client.phone ?? (language === "ar" ? "كشف الحساب" : "Statement")}</p>
            </div>
          </div>
        </div>
        <ShareButton
          exportOptions={{
            title: client.name,
            subtitle: language === "ar" ? "كشف الحساب" : "Client Statement",
            transactions: transactions.map((tx) => ({
              date: tx.date,
              type: tx.type,
              description: tx.description,
              amount: tx.amount,
              currency: tx.currency,
            })),
            totals: balances.map((b) => ({
              currency: b.currency,
              paid: b.paid,
              received: b.received,
              openBalance: b.openBalance,
            })),
            primaryCurrency,
            primaryTotal: totalInPrimary,
          }}
        />
      </div>

      {/* ── Total Summary Card (in primary currency) ── */}
      <div
        className={cn(
          "rounded-2xl p-5 border shadow-sm",
          totalInPrimary === 0
            ? "bg-muted/40 border-border"
            : totalInPrimary > 0
            ? "bg-gradient-to-br from-green-50 to-green-100/50 border-green-200 dark:from-green-900/20 dark:to-green-800/10 dark:border-green-800/40"
            : "bg-gradient-to-br from-red-50 to-red-100/50 border-red-200 dark:from-red-900/20 dark:to-red-800/10 dark:border-red-800/40"
        )}
        data-testid="total-primary-card"
      >
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-muted-foreground">
            {language === "ar" ? `الإجمالي بـ ${primaryCurrency}` : `Total in ${primaryCurrency}`}
          </span>
          <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full ms-auto">{primaryCurrency}</span>
        </div>

        <p className={cn("text-3xl font-bold", totalInPrimary === 0 ? "text-foreground" : totalInPrimary > 0 ? "text-green-600" : "text-red-600")}>
          {totalInPrimary === 0
            ? language === "ar" ? "مسدد بالكامل" : "Fully Settled"
            : totalInPrimary > 0
            ? (language === "ar" ? "له " : "") + formatAmount(totalInPrimary, primaryCurrency)
            : (language === "ar" ? "عليه " : "-") + formatAmount(Math.abs(totalInPrimary), primaryCurrency)}
        </p>

        {balances.length > 0 && totalInPrimary !== 0 && hasNonPrimary && (
          <p className="text-xs text-muted-foreground mt-1">
            {language === "ar" ? "مجموع كل العملات محوّلاً" : "All currencies converted"}
          </p>
        )}

        {/* Exchange rates used */}
        {hasNonPrimary && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-black/5 dark:border-white/10">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3" />
              <span className="font-medium">{exchangeRateMode === "auto" ? t("automatic") : t("manual")}</span>
            </div>
            {balances
              .filter((b) => b.currency !== primaryCurrency)
              .map((b) => {
                const rate = effectiveRates[b.currency];
                if (!rate) return null;
                const decimals = ["SYP", "IQD", "LBP"].includes(b.currency) ? 4 : 2;
                return (
                  <span key={b.currency} className="text-xs text-muted-foreground">
                    1 {b.currency} = {rate.toFixed(decimals)} AED
                  </span>
                );
              })}
          </div>
        )}
      </div>

      {/* Per-currency open balances */}
      {balances.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {language === "ar" ? "الأرصدة المفتوحة" : "Open Balances"}
          </h2>
          <div className="space-y-3">
            {balances.map((b) => {
              const inPrimary = toPrimary(b.openBalance, b.currency, effectiveRates, primaryCurrency);
              return (
                <div key={b.currency} className="bg-card border border-border rounded-2xl p-4 shadow-sm" data-testid={`balance-${b.currency}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={cn("text-xs font-bold px-2.5 py-1 rounded-full", currencyClass(b.currency))}>
                      {b.currency}
                    </span>
                    <div className="text-end">
                      <span className={cn("text-lg font-bold block", b.openBalance >= 0 ? "text-green-600" : "text-red-600")}>
                        {b.openBalance === 0
                          ? language === "ar" ? "مسدد" : "Settled"
                          : b.openBalance > 0
                          ? (language === "ar" ? "له " : "") + formatAmount(b.openBalance, b.currency)
                          : (language === "ar" ? "عليه " : "-") + formatAmount(Math.abs(b.openBalance), b.currency)}
                      </span>
                      {b.currency !== primaryCurrency && b.openBalance !== 0 && (
                        <span className="text-xs text-muted-foreground">
                          ≈ {formatAmount(Math.abs(inPrimary), primaryCurrency)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-xs text-muted-foreground">{language === "ar" ? "مدفوع:" : "Paid:"}</span>
                      <span className="text-xs font-semibold text-red-600">{formatAmount(b.paid, b.currency)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-xs text-muted-foreground">{language === "ar" ? "مقبوض:" : "Received:"}</span>
                      <span className="text-xs font-semibold text-green-600">{formatAmount(b.received, b.currency)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-6 text-center">
          <Minus className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">
            {language === "ar" ? "لا توجد أرصدة مفتوحة" : "No open balances"}
          </p>
        </div>
      )}

      {/* Transactions list */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          {language === "ar" ? `المعاملات (${transactions.length})` : `Transactions (${transactions.length})`}
        </h2>
        {transactions.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <p className="text-muted-foreground text-sm">
              {language === "ar" ? "لا توجد معاملات لهذا الزبون" : "No transactions for this client"}
            </p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="divide-y divide-border">
              {transactions.map((tx) => {
                const inPrimary = toPrimary(tx.amount, tx.currency, effectiveRates, primaryCurrency);
                const isDebit = tx.type === "expense" || tx.type === "payment";
                return (
                  <div key={tx.id} className="p-4 flex items-start gap-3" data-testid={`stmt-tx-${tx.id}`}>
                    <div
                      className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", {
                        "bg-green-500": tx.type === "income",
                        "bg-red-500": tx.type === "expense",
                        "bg-blue-500": tx.type === "payment",
                        "bg-emerald-500": tx.type === "receipt",
                      })}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-semibold", typeClass(tx.type))}>
                          {typeLabel(tx.type, language)}
                        </span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", statusClass(tx.status))}>
                          {statusLabel(tx.status, language)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{formatDate(tx.date, language)}</span>
                        {tx.tripName && <span className="text-xs text-blue-500">{tx.tripName}</span>}
                      </div>
                      {tx.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{tx.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-end">
                      <span className={cn("text-sm font-bold block", typeClass(tx.type))}>
                        {isDebit ? "-" : "+"}{formatAmount(tx.amount, tx.currency)}
                      </span>
                      {tx.currency !== primaryCurrency && (
                        <span className="text-[11px] text-muted-foreground">
                          ≈ {isDebit ? "-" : "+"}{formatAmount(inPrimary, primaryCurrency)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total row */}
            <div className="px-4 py-3 bg-muted/30 border-t border-border flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">
                {language === "ar" ? `الإجمالي (${primaryCurrency})` : `Total (${primaryCurrency})`}
              </span>
              <span className={cn("text-sm font-bold", totalInPrimary >= 0 ? "text-green-600" : "text-red-600")}>
                {totalInPrimary >= 0 ? "+" : ""}{formatAmount(totalInPrimary, primaryCurrency)}
              </span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
