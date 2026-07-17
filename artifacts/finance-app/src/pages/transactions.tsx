import { useState } from "react";
import {
  useListTransactions,
  useDeleteTransaction,
  useUpdateTransaction,
  useListClients,
  useListTrips,
  useListStudios,
  getListTransactionsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { Transaction } from "@workspace/api-zod";
import { formatAmount, typeLabel, typeClass, statusLabel, statusClass, currencyClass, formatDate, cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Filter, Trash2, ArrowLeftRight, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";

const TYPES = ["", "income", "expense", "payment", "receipt"];
const STATUSES = ["", "pending", "settled"];

export default function Transactions() {
  const [currency, setCurrency] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language, currencies, primaryCurrency, manualRates, showClients, showTrips, showStudios } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data: clients } = useListClients({ query: { enabled: showClients } });
  const { data: trips } = useListTrips({ query: { enabled: showTrips } });
  const { data: studios } = useListStudios({ query: { enabled: showStudios } });

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

  const updateMutation = useUpdateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentTransactionsQueryKey() });
        toast({ title: t("updatedSuccess"), description: t("updatedDesc") });
        setEditingTx(null);
      },
      onError: () => {
        toast({ title: t("updateErrorDesc"), variant: "destructive" });
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
                          onClick={() => setEditingTx(tx)}
                          className="text-muted-foreground hover:text-primary transition-colors p-1"
                          data-testid={`btn-edit-tx-${tx.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
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

      {editingTx && (
        <EditTransactionModal
          tx={editingTx}
          language={language}
          currencies={currencies}
          clients={clients}
          trips={trips}
          studios={studios}
          showClients={showClients}
          showTrips={showTrips}
          showStudios={showStudios}
          isSaving={updateMutation.isPending}
          onClose={() => setEditingTx(null)}
          onSave={(patch) => updateMutation.mutate({ id: editingTx.id, data: patch })}
        />
      )}
    </div>
  );
}

function EditTransactionModal({
  tx,
  language,
  currencies,
  clients,
  trips,
  studios,
  showClients,
  showTrips,
  showStudios,
  isSaving,
  onClose,
  onSave,
}: {
  tx: Transaction;
  language: "ar" | "en";
  currencies: string[];
  clients?: { id: number; name: string }[];
  trips?: { id: number; name: string }[];
  studios?: { id: number; name: string }[];
  showClients: boolean;
  showTrips: boolean;
  showStudios: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (patch: {
    type: string;
    amount: number;
    currency: string;
    status: string;
    date: string;
    description: string | null;
    clientId: number | null;
    tripId: number | null;
    studioId: number | null;
  }) => void;
}) {
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);
  const [form, setForm] = useState({
    type: tx.type,
    amount: String(tx.amount),
    currency: tx.currency,
    status: tx.status,
    date: tx.date.split("T")[0],
    description: tx.description ?? "",
    clientId: tx.clientId != null ? String(tx.clientId) : "",
    tripId: tx.tripId != null ? String(tx.tripId) : "",
    studioId: tx.studioId != null ? String(tx.studioId) : "",
  });

  function handleSubmit() {
    const amountNum = parseFloat(form.amount);
    if (!amountNum || amountNum <= 0) return;
    onSave({
      type: form.type,
      amount: amountNum,
      currency: form.currency,
      status: form.status,
      date: form.date,
      description: form.description.trim() ? form.description.trim() : null,
      clientId: form.clientId ? Number(form.clientId) : null,
      tripId: form.tripId ? Number(form.tripId) : null,
      studioId: form.studioId ? Number(form.studioId) : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className={cn(
          "bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto",
          language === "ar" ? "text-right" : "text-left"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-bold text-lg">{t("editTransaction")}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1" data-testid="btn-close-edit-modal">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("typeLabel2")}</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
              data-testid="edit-tx-type"
            >
              {TYPES.filter(Boolean).map((tp) => (
                <option key={tp} value={tp}>{typeLabel(tp, language)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("amountLabel")}</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                data-testid="edit-tx-amount"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("currencyLabel")}</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                data-testid="edit-tx-currency"
              >
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("statusLabel2")}</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                data-testid="edit-tx-status"
              >
                {STATUSES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>{statusLabel(s, language)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("dateLabel")}</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                data-testid="edit-tx-date"
              />
            </div>
          </div>

          {showClients && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("clientLabel")}</label>
              <select
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                data-testid="edit-tx-client"
              >
                <option value="">{t("noneOption")}</option>
                {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {showTrips && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("tripLabel")}</label>
              <select
                value={form.tripId}
                onChange={(e) => setForm((f) => ({ ...f, tripId: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                data-testid="edit-tx-trip"
              >
                <option value="">{t("noneOption")}</option>
                {trips?.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
              </select>
            </div>
          )}

          {showStudios && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("studioLabel")}</label>
              <select
                value={form.studioId}
                onChange={(e) => setForm((f) => ({ ...f, studioId: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                data-testid="edit-tx-studio"
              >
                <option value="">{t("noneOption")}</option>
                {studios?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("descriptionLabel")}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm min-h-[70px]"
              data-testid="edit-tx-description"
            />
          </div>
        </div>

        <div className="flex gap-3 p-4 border-t border-border sticky bottom-0 bg-card">
          <button
            onClick={onClose}
            className="flex-1 border border-border rounded-xl py-2.5 text-sm font-semibold"
            data-testid="btn-cancel-edit"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSaving}
            className="flex-1 bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            data-testid="btn-save-edit"
          >
            {isSaving ? "..." : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
