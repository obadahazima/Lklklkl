import { useState } from "react";
import {
  useListTransactions,
  useDeleteTransaction,
  getListTransactionsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentTransactionsQueryKey,
} from "@workspace/api-client-react";
import { formatAmount, typeLabel, typeClass, statusLabel, statusClass, currencyClass, formatDate, cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Filter, Trash2, ArrowLeftRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";

const TYPES = ["", "income", "expense", "payment", "receipt"];
const STATUSES = ["", "pending", "settled"];

export default function Transactions() {
  const [currency, setCurrency] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language, currencies, primaryCurrency, manualRates } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  function toEquivalent(amount: number, currency: string): number {
    const inAed = currency === "AED" ? amount : amount * (manualRates[currency] ?? 1);
    return primaryCurrency === "AED" ? inAed : inAed / (manualRates[primaryCurrency] ?? 1);
  }

  const params = {
    currency: currency || undefined,
    type: type || undefined,
    status: status || undefined,
  };
  const { data: txs, isLoading } = useListTransactions(params, {
    query: { queryKey: getListTransactionsQueryKey(params) },
  });

  const deleteMutation = useDeleteTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentTransactionsQueryKey() });
        toast({ title: t("deletedSuccess"), description: t("deletedDesc") });
      },
    },
  });

  return (
    <div className={cn("p-4 space-y-4 max-w-2xl mx-auto pb-24 lg:pb-6", language === "ar" ? "text-right" : "text-left")}>
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">{t("transactions")}</h1>
          <p className="text-muted-foreground text-sm">{txs?.length ?? 0} {t("transactionCount")}</p>
        </div>
        <Link href="/transactions/new">
          <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold" data-testid="btn-add-transaction">
            <Plus className="w-4 h-4" />
            {t("new")}
          </button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
          <Filter className="w-4 h-4" />
        </div>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground shrink-0"
          data-testid="filter-currency"
        >
          <option value="">{t("allCurrencies")}</option>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground shrink-0"
          data-testid="filter-type"
        >
          <option value="">{t("allTypes")}</option>
          {TYPES.filter(Boolean).map((tp) => (
            <option key={tp} value={tp}>{typeLabel(tp, language)}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground shrink-0"
          data-testid="filter-status"
        >
          <option value="">{t("allStatuses")}</option>
          {STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{statusLabel(s, language)}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                <div className="h-3 bg-muted rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : txs?.length === 0 ? (
          <div className="p-10 text-center">
            <ArrowLeftRight className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{t("noTransactionsFound")}</p>
            <Link href="/transactions/new">
              <span className="text-primary text-sm font-medium mt-1 block">{t("addNewTransaction")}</span>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {txs?.map((tx) => (
              <div key={tx.id} className="p-4" data-testid={`transaction-row-${tx.id}`}>
                <div className="flex items-start gap-3">
                  <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5", {
                    "bg-green-500": tx.type === "income",
                    "bg-red-500": tx.type === "expense",
                    "bg-blue-500": tx.type === "payment",
                    "bg-emerald-500": tx.type === "receipt",
                  })} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-sm font-bold", typeClass(tx.type))}>{typeLabel(tx.type, language)}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", currencyClass(tx.currency))}>{tx.currency}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", statusClass(tx.status))}>{statusLabel(tx.status, language)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-end">
                          <span className={cn("text-base font-bold block", typeClass(tx.type))}>
                            {tx.type === "expense" || tx.type === "payment" ? "-" : "+"}{formatAmount(tx.amount, tx.currency)}
                          </span>
                          {tx.currency !== primaryCurrency && (
                            <span className="text-[10px] text-muted-foreground">
                              ≈ {formatAmount(toEquivalent(tx.amount, tx.currency), primaryCurrency)}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => window.confirm(t("deleteTransactionConfirm")) && deleteMutation.mutate({ id: tx.id })}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                          data-testid={`btn-delete-tx-${tx.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-muted-foreground">{formatDate(tx.date, language)}</span>
                      {tx.clientName && <span className="text-xs text-foreground/70">{tx.clientName}</span>}
                      {tx.tripName && <span className="text-xs text-blue-500">{tx.tripName}</span>}
                    </div>
                    {tx.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{tx.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
