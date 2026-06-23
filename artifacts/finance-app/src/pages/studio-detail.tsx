import { useState } from "react";
import {
  useGetStudio,
  useListStudioExpenses,
  useCreateStudioExpense,
  useDeleteStudioExpense,
  getGetStudioQueryKey,
  getListStudioExpensesQueryKey,
} from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { formatAmount, currencyClass, formatDate, cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { ShareButton } from "@/components/share-button";
import { tr, type Lang } from "@/lib/i18n";

const CATEGORIES: { value: string; label: Record<Lang, string> }[] = [
  { value: "rent",        label: { ar: "إيجار",    en: "Rent"         } },
  { value: "electricity", label: { ar: "كهرباء",   en: "Electricity"  } },
  { value: "internet",    label: { ar: "إنترنت",   en: "Internet"     } },
  { value: "maintenance", label: { ar: "صيانة",    en: "Maintenance"  } },
  { value: "other",       label: { ar: "أخرى",     en: "Other"        } },
];

export default function StudioDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = parseInt(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    category: "rent",
    amount: "",
    currency: "AED",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const { settings } = useSettings();
  const { primaryCurrency, exchangeRateMode, manualRates, language } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data: studio } = useGetStudio(id, {
    query: { enabled: !!id, queryKey: getGetStudioQueryKey(id) },
  });
  const { data: expenses, isLoading } = useListStudioExpenses(id, {
    query: { enabled: !!id, queryKey: getListStudioExpensesQueryKey(id) },
  });

  const createMutation = useCreateStudioExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStudioExpensesQueryKey(id) });
        setShowAdd(false);
        setForm({ category: "rent", amount: "", currency: "AED", date: new Date().toISOString().split("T")[0], notes: "" });
        toast({ title: t("addedExpense") });
      },
    },
  });

  const deleteMutation = useDeleteStudioExpense({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListStudioExpensesQueryKey(id) });
        toast({ title: t("deletedExpense") });
      },
    },
  });

  const totals = expenses?.reduce(
    (acc, e) => {
      acc[e.currency] = (acc[e.currency] || 0) + Number(e.amount);
      return acc;
    },
    {} as Record<string, number>
  ) || {};

  const rates = manualRates; // studio expenses don't carry API rates; use user-defined rates
  const toAed = (amount: number, currency: string) =>
    currency === "AED" ? amount : amount * (rates[currency] ?? 1);
  const toPrimary = (amount: number, currency: string) => {
    const inAed = toAed(amount, currency);
    return primaryCurrency === "AED" ? inAed : inAed / (rates[primaryCurrency] ?? 1);
  };

  const primaryTotal = Math.round(
    Object.entries(totals).reduce((sum, [cur, amt]) => sum + toPrimary(amt, cur), 0) * 100
  ) / 100;

  const exportTotals = Object.entries(totals).map(([currency, amt]) => ({
    currency,
    paid: amt,
    received: 0,
    openBalance: -amt,
  }));

  const getCategoryLabel = (value: string) =>
    CATEGORIES.find((c) => c.value === value)?.label[language] ?? value;

  const ChevronBack = language === "ar" ? ChevronLeft : ChevronRight;

  return (
    <div className={cn("p-4 space-y-5 max-w-2xl mx-auto pb-24 lg:pb-6", language === "ar" ? "text-right" : "text-left")}>
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => setLocation("/studios")} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
          <ChevronBack className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{studio?.name || "..."}</h1>
          <p className="text-xs text-muted-foreground">{t("studioExpensesTitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <ShareButton
            exportOptions={{
              title: studio?.name || t("studios"),
              subtitle: t("studioExpensesTitle"),
              transactions: (expenses ?? []).map((e) => ({
                date: e.date,
                type: "expense",
                description: [getCategoryLabel(e.category), e.notes].filter(Boolean).join(" — "),
                amount: Number(e.amount),
                currency: e.currency,
              })),
              totals: exportTotals,
              primaryCurrency,
              primaryTotal: -primaryTotal,
            }}
          />
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-xs font-semibold"
            data-testid="btn-add-expense"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("addExpenseBtn")}
          </button>
        </div>
      </div>

      {/* Totals */}
      {Object.keys(totals).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(totals).map(([currency, total]) => (
            <div key={currency} className={cn("px-3 py-2 rounded-xl border text-sm font-bold", currencyClass(currency))}>
              {t("totalLabel")} {formatAmount(total, currency)}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">{t("addExpenseTitle")}</h2>
            <button onClick={() => setShowAdd(false)} className="text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="select-expense-category"
            >
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label[language]}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder={t("amountLabel")}
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="input-expense-amount"
              />
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="select-expense-currency"
              >
                {settings.currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="input-expense-date"
            />
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("notesPlaceholder")}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="input-expense-notes"
            />
            <button
              onClick={() => form.amount && createMutation.mutate({
                id,
                data: { category: form.category, amount: parseFloat(form.amount), currency: form.currency, date: form.date, notes: form.notes || undefined },
              })}
              disabled={createMutation.isPending || !form.amount}
              className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              data-testid="btn-save-expense"
            >
              {t("save")}
            </button>
          </div>
        </div>
      )}

      {/* Expenses list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="divide-y divide-border">
            {[1, 2, 3].map((i) => <div key={i} className="p-4 animate-pulse"><div className="h-4 bg-muted rounded w-1/2" /></div>)}
          </div>
        ) : expenses?.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground text-sm">{t("noExpenses")}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {expenses?.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between p-4" data-testid={`expense-row-${expense.id}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {getCategoryLabel(expense.category)}
                    </span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-bold", currencyClass(expense.currency))}>
                      {expense.currency}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(expense.date, language)}</span>
                  {expense.notes && <p className="text-xs text-muted-foreground mt-0.5">{expense.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-600">{formatAmount(Number(expense.amount), expense.currency)}</span>
                  <button
                    onClick={() => deleteMutation.mutate({ expenseId: expense.id })}
                    className="text-muted-foreground hover:text-destructive p-1"
                    data-testid={`btn-delete-expense-${expense.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
