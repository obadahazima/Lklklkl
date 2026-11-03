import { QueryFeedback } from "@/components/query-feedback";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@clerk/react";
import { webLedger } from "@/lib/offline-ledger";
import { OfflineQueuePanel } from "@/components/offline-ledger";
import { useState } from "react";
import {
  useListTransactions, useOfflineLedger, useListAccounts, normalizeAmountInput, transactionError, manualErrorMessage,
  useDeleteTransaction,
  useUpdateTransaction,
  useListClients,
  useListTrips,
  getListTransactionsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentTransactionsQueryKey,
  getListClientsQueryKey,
  getListTripsQueryKey,
} from "@workspace/api-client-react";
import type { Transaction } from "@workspace/api-zod";
import { formatAmount, typeLabel, typeClass, statusLabel, statusClass, currencyClass, formatDate, cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Filter, Trash2, ArrowLeftRight, Pencil, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";

const TYPES = ["", "income", "expense", "payment", "receipt", "transfer"];
const STATUSES = ["", "pending", "settled"];

export default function Transactions() {
  const [currency, setCurrency] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const { toast } = useToast();
  const { userId } = useAuth();
  const offline = useOfflineLedger(webLedger, userId);
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language, currencies, primaryCurrency, manualRates, showClients, showTrips } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data: clients } = useListClients({ query: { queryKey: getListClientsQueryKey(), enabled: showClients } });
  const { data: trips } = useListTrips({ query: { queryKey: getListTripsQueryKey(), enabled: showTrips } });

  function toEquivalent(amount: number, currency: string): number {
    const inAed = currency === "AED" ? amount : amount * (manualRates[currency] ?? 1);
    return primaryCurrency === "AED" ? inAed : inAed / (manualRates[primaryCurrency] ?? 1);
  }

  const params = {
    currency: currency || undefined,
    type: type || undefined,
    status: status || undefined,
  };
  const { data: remoteTxs, isLoading, isError, refetch } = useListTransactions(params, {
    query: { queryKey: getListTransactionsQueryKey(params) },
  });

  const txs = remoteTxs ?? offline.record.references.transactions?.filter((tx) => (!currency || tx.currency === currency) && (!type || tx.type === type) && (!status || tx.status === status));

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
          <p className="text-muted-foreground text-sm">{txs?.length ?? "—"} {t("transactionCount")}</p>
        </div>
        <Link href="/transactions/new">
          <button className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold" data-testid="btn-add-transaction">
            <Plus className="w-4 h-4" />
            {t("new")}
          </button>
        </Link>
      </div>

      <OfflineQueuePanel owner={userId} ar={language === "ar"} cached={!remoteTxs && !!txs?.length} />
      {isError && <QueryFeedback ar={language === "ar"} retry={refetch} cached={!!txs} />}
      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
          <Filter className="w-4 h-4" />
        </div>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground shrink-0"
          aria-label={t("currencyLabel")} data-testid="filter-currency"
        >
          <option value="">{t("allCurrencies")}</option>
          {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card text-foreground shrink-0"
          aria-label={t("typeLabel")} data-testid="filter-type"
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
          aria-label={t("statusLabel2")} data-testid="filter-status"
        >
          <option value="">{t("allStatuses")}</option>
          {STATUSES.filter(Boolean).map((s) => (
            <option key={s} value={s}>{statusLabel(s, language)}</option>
          ))}
        </select>
        {(currency || type || status) && <button type="button" onClick={() => { setCurrency(""); setType(""); setStatus(""); }} className="text-sm text-primary underline shrink-0 px-2">{language === "ar" ? "مسح الفلاتر" : "Clear filters"}</button>}
      </div>

      {/* List */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        {isError && !txs ? null : isLoading && !txs?.length ? (
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
                    "bg-purple-500": tx.type === "transfer",
                  })} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={cn("text-sm font-bold", typeClass(tx.type))}>{typeLabel(tx.type, language)}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", currencyClass(tx.currency))}>{tx.currency}</span>
                        <span className={cn("text-xs px-1.5 py-0.5 rounded-full font-medium", statusClass(tx.status))}>{statusLabel(tx.status, language)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-end">
                          <span className={cn("text-base font-bold block", typeClass(tx.type))}>
                            {tx.type === "transfer" ? "" : tx.type === "expense" || tx.type === "payment" ? "-" : "+"}{formatAmount(tx.amount, tx.currency, language)}
                          </span>
                          {tx.currency !== primaryCurrency && (
                            <span className="text-[10px] text-muted-foreground">
                              ≈ {formatAmount(toEquivalent(tx.amount, tx.currency), primaryCurrency, language)}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setEditingTx(tx)}
                          aria-label={language === "ar" ? "تعديل المعاملة" : "Edit transaction"} className="text-muted-foreground hover:text-primary transition-colors p-2"
                          data-testid={`btn-edit-tx-${tx.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => window.confirm(t("deleteTransactionConfirm")) && deleteMutation.mutate({ id: tx.id })}
                          aria-label={language === "ar" ? "حذف المعاملة" : "Delete transaction"} disabled={deleteMutation.isPending} className="text-muted-foreground hover:text-destructive transition-colors p-2"
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
          showClients={showClients}
          showTrips={showTrips}
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
  showClients,
  showTrips,
  isSaving,
  onClose,
  onSave,
}: {
  tx: Transaction;
  language: "ar" | "en";
  currencies: string[];
  clients?: { id: number; name: string }[];
  trips?: { id: number; name: string }[];
  showClients: boolean;
  showTrips: boolean;
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
    accountId: number;
    toAccountId: number | null;
  }) => void;
}) {
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);
  const { data: accounts, isError: accountsError, refetch: retryAccounts } = useListAccounts();
  const { toast } = useToast();
  const [form, setForm] = useState({
    accountId: tx.accountId == null ? "" : String(tx.accountId),
    toAccountId: tx.toAccountId == null ? "" : String(tx.toAccountId),
    type: tx.type,
    amount: String(tx.amount),
    currency: tx.currency,
    status: tx.status,
    date: tx.date.split("T")[0],
    description: tx.description ?? "",
    clientId: tx.clientId != null ? String(tx.clientId) : "",
    tripId: tx.tripId != null ? String(tx.tripId) : "",
  });

  function handleSubmit() {
    if (isSaving) return;
    const patch = {
      type: form.type, amount: normalizeAmountInput(form.amount), currency: form.currency,
      status: form.status, date: form.date, description: form.description.trim() || null,
      accountId: Number(form.accountId), toAccountId: form.type === "transfer" ? Number(form.toAccountId) : null,
      clientId: form.type === "transfer" ? null : (form.clientId ? Number(form.clientId) : null),
      tripId: form.type === "transfer" ? null : (form.tripId ? Number(form.tripId) : null),
    };
    const error = transactionError(patch);
    if (error) { toast({ title: manualErrorMessage(error, language === "ar"), variant: "destructive" }); return; }
    onSave(patch);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isSaving) onClose(); }}>
      <DialogContent dir={language === "ar" ? "rtl" : "ltr"} aria-describedby="edit-transaction-description" className="block w-[94vw] max-w-md p-0 gap-0 rounded-2xl max-h-[90dvh] overflow-y-auto bg-card">
        <div className="p-4 px-12 border-b border-border sticky top-0 bg-card">
          <DialogTitle>{t("editTransaction")}</DialogTitle>
          <DialogDescription id="edit-transaction-description" className="sr-only">{language === "ar" ? "راجع بيانات المعاملة ثم احفظ التعديلات" : "Review the transaction and save your changes"}</DialogDescription>
        </div>
        <fieldset disabled={isSaving} className="p-4 space-y-4">
          <div>
            <label htmlFor="edit-type" className="text-xs text-muted-foreground mb-1 block">{t("typeLabel2")}</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
              id="edit-type" data-testid="edit-tx-type"
            >
              {TYPES.filter(Boolean).map((tp) => (
                <option key={tp} value={tp}>{typeLabel(tp, language)}</option>
              ))}
            </select>
          </div>

          {accountsError && <QueryFeedback ar={language === "ar"} retry={retryAccounts} cached={!!accounts} />}
          <div className="space-y-3">
            <label className="block text-sm">{language === "ar" ? "الحساب المصدر" : "Source account"}<select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background p-3"><option value="">{language === "ar" ? "اختر حساباً" : "Choose an account"}</option>{!accounts?.some(a => String(a.id) === form.accountId) && tx.accountId != null && <option value={String(tx.accountId)}>{tx.accountName || (language === "ar" ? "الحساب الحالي" : "Current account")}</option>}{accounts?.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
            {form.type === "transfer" && <label className="block text-sm">{language === "ar" ? "الحساب الوجهة" : "Destination account"}<select value={form.toAccountId} onChange={e => setForm(f => ({ ...f, toAccountId: e.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background p-3"><option value="">{language === "ar" ? "اختر حساباً مختلفاً" : "Choose a different account"}</option>{!accounts?.some(a => String(a.id) === form.toAccountId) && tx.toAccountId != null && <option value={String(tx.toAccountId)}>{tx.toAccountName || (language === "ar" ? "الوجهة الحالية" : "Current destination")}</option>}{accounts?.filter(a => String(a.id) !== form.accountId).map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-amount" className="text-xs text-muted-foreground mb-1 block">{t("amountLabel")}</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                id="edit-amount" data-testid="edit-tx-amount"
              />
            </div>
            <div>
              <label htmlFor="edit-currency" className="text-xs text-muted-foreground mb-1 block">{t("currencyLabel")}</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                id="edit-currency" data-testid="edit-tx-currency"
              >
                {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-status" className="text-xs text-muted-foreground mb-1 block">{t("statusLabel2")}</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                id="edit-status" data-testid="edit-tx-status"
              >
                {STATUSES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>{statusLabel(s, language)}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-date" className="text-xs text-muted-foreground mb-1 block">{t("dateLabel")}</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                id="edit-date" data-testid="edit-tx-date"
              />
            </div>
          </div>

          {form.type !== "transfer" && showClients && (
            <div>
              <label htmlFor="edit-client" className="text-xs text-muted-foreground mb-1 block">{t("clientLabel")}</label>
              <select
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                id="edit-client" data-testid="edit-tx-client"
              >
                <option value="">{t("noneOption")}</option>
                {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          {form.type !== "transfer" && showTrips && (
            <div>
              <label htmlFor="edit-trip" className="text-xs text-muted-foreground mb-1 block">{t("tripLabel")}</label>
              <select
                value={form.tripId}
                onChange={(e) => setForm((f) => ({ ...f, tripId: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm"
                id="edit-trip" data-testid="edit-tx-trip"
              >
                <option value="">{t("noneOption")}</option>
                {trips?.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="edit-description" className="text-xs text-muted-foreground mb-1 block">{t("descriptionLabel")}</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-border rounded-lg px-3 py-2 bg-background text-foreground text-sm min-h-[70px]"
              id="edit-description" data-testid="edit-tx-description"
            />
          </div>
        </fieldset>

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
            {isSaving ? t("saving") : t("save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
