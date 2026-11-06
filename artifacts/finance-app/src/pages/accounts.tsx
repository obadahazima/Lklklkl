import { QueryFeedback } from "@/components/query-feedback";
import { useState } from "react";
import {
  useListAccounts, openingAccountBalance, optionalCreditLimit, creditAvailability,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  getListAccountsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, CreditCard, Wallet, Landmark, X, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, typeof Wallet> = { cash: Wallet, debit: Landmark, credit: CreditCard };

// A fixed, curated palette (rather than a raw color input) keeps every account visually distinct
// and legible against both light/dark backgrounds, and matches the "pick a wallet color" pattern
// from apps like this.
const ACCOUNT_COLORS = [
  "#3B82F6", "#EF4444", "#F59E0B", "#10B981",
  "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
  "#6366F1", "#14B8A6", "#84CC16", "#64748B",
];

export default function Accounts() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [currency, setCurrency] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");
  const [creditLimit, setCreditLimit] = useState("");
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language, primaryCurrency } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data: accounts, isLoading, isError, refetch } = useListAccounts();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setType("cash");
    setCurrency(primaryCurrency || "AED");
    setInitialBalance("0");
    setCreditLimit("");
    setColor(ACCOUNT_COLORS[0]);
  };

  const createMutation = useCreateAccount({
    mutation: {
      onSuccess: () => {
        invalidate();
        resetForm();
        toast({ title: language === "ar" ? "تمت إضافة الحساب" : "Account added" });
      },
    },
  });

  const updateMutation = useUpdateAccount({
    mutation: {
      onSuccess: () => {
        invalidate();
        resetForm();
        toast({ title: language === "ar" ? "تم التعديل" : "Updated" });
      },
    },
  });

  const deleteMutation = useDeleteAccount({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: language === "ar" ? "تم الحذف" : "Deleted" });
      },
    },
  });

  function startEdit(account: NonNullable<typeof accounts>[number]) {
    setEditingId(account.id);
    setName(account.name);
    setType(account.type);
    setCurrency(account.currency);
    setInitialBalance(String(account.initialBalance));
    setCreditLimit(account.creditLimit == null ? "" : String(account.creditLimit));
    setColor(account.color || ACCOUNT_COLORS[0]);
    setShowForm(true);
  }

  function handleSave() {
    if (!name.trim() || createMutation.isPending || updateMutation.isPending) return;
    const balance = openingAccountBalance(type, initialBalance);
    const limit = type === "credit" ? optionalCreditLimit(creditLimit) : null;
    if (limit !== null && !Number.isFinite(limit)) { toast({ title: language === "ar" ? "أدخل ليميت موجباً بمنزلتين عشريتين كحد أقصى، أو اتركه فارغاً" : "Enter a valid non-negative credit limit or leave it blank", variant: "destructive" }); return; }
    if (!Number.isFinite(balance) || Math.abs(balance) >= 1e13) { toast({ title: language === "ar" ? "راجع الرصيد الافتتاحي؛ أدخل رقماً صحيحاً بمنزلتين عشريتين كحد أقصى" : "Enter a valid opening balance with at most two decimal places", variant: "destructive" }); return; }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: { name: name.trim(), type, currency, color, initialBalance: balance, creditLimit: limit },
      });
    } else {
      createMutation.mutate({
        data: { name: name.trim(), type, currency: currency || primaryCurrency || "AED", color, initialBalance: balance, creditLimit: limit },
      });
    }
  }

  function handleDelete(id: number) {
    const confirmMsg = language === "ar" ? "متأكد بدك تحذف هالحساب؟ المعاملات القديمة رح تضل موجودة بس بدون ربط فيه." : "Delete this account? Past transactions will stay but lose their link to it.";
    if (window.confirm(confirmMsg)) deleteMutation.mutate({ id });
  }

  const typeLabel = (ty: string) =>
    ty === "cash" ? (language === "ar" ? "كاش" : "Cash") : ty === "credit" ? (language === "ar" ? "بطاقة ائتمان" : "Credit card") : (language === "ar" ? "بطاقة ديبت" : "Debit card");

  const totalsByCurrency = (accounts ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.currency] = (acc[a.currency] ?? 0) + a.currentBalance;
    return acc;
  }, {});

  return (
    <div className={cn("p-4 space-y-4 max-w-2xl mx-auto pb-24 lg:pb-6", language === "ar" ? "text-right" : "text-left")}>
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">{language === "ar" ? "الحسابات" : "Accounts"}</h1>
          <p className="text-muted-foreground text-sm">
            {accounts?.length ?? "—"} {language === "ar" ? "حساب" : "accounts"}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold"
          data-testid="btn-add-account"
        >
          <Plus className="w-4 h-4" />
          {language === "ar" ? "حساب جديد" : "New account"}
        </button>
      </div>

      {Object.keys(totalsByCurrency).length > 0 && (
        <div className="assistant-hero assistant-card rounded-xl p-3 flex flex-wrap gap-3">
          <span className="text-sm opacity-90">{language === "ar" ? "الإجمالي عبر كل الحسابات:" : "Total across all accounts:"}</span>
          {Object.entries(totalsByCurrency).map(([cur, total]) => (
            <span key={cur} className="text-sm font-bold">{total.toFixed(2)} {cur}</span>
          ))}
        </div>
      )}

      {showForm && (
        <div className="bg-card border-2 border-primary/20 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-sm">
              {editingId ? (language === "ar" ? "تعديل الحساب" : "Edit account") : (language === "ar" ? "إضافة حساب" : "Add account")}
            </h2>
            <button aria-label={language === "ar" ? "إغلاق النموذج" : "Close form"} onClick={resetForm} className="text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={language === "ar" ? "اسم الحساب (مثلاً: فيزا الشغل)" : "Account name (e.g. Visa)"}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
              data-testid="input-account-name"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="select-account-type"
              >
                <option value="cash">{language === "ar" ? "كاش" : "Cash"}</option>
                <option value="debit">{language === "ar" ? "بطاقة ديبت" : "Debit card"}</option>
                <option value="credit">{language === "ar" ? "بطاقة ائتمان" : "Credit card"}</option>
              </select>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="select-account-currency"
              >
                {settings.currencies.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="accounts-field-1" className="text-xs font-medium text-muted-foreground mb-1 block">
                {type === "credit" ? (language === "ar" ? "المديونية الافتتاحية (اختياري)" : "Opening debt (optional)") : (language === "ar" ? "الرصيد الابتدائي (اختياري)" : "Initial balance (optional)")}
              </label>
              <div className="flex items-center gap-2" dir="ltr">
              {type === "credit" && <span className="text-xl font-bold text-destructive" aria-hidden="true">−</span>}
              <input id="accounts-field-1"
                type="text" inputMode="decimal"
                value={type === "credit" ? initialBalance.replace(/^\s*[-−]\s*/, "") : initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                aria-describedby={type === "credit" ? "credit-opening-hint" : undefined}
                data-testid="input-account-initial-balance"
              />
              </div>
              {type === "credit" && <p id="credit-opening-hint" role="status" className="text-xs text-muted-foreground mt-2">
                {language === "ar" ? "نضيف السالب تلقائياً لأنها مديونية. كتابة المبلغ بسالب مقبولة أيضاً، والإشارة تُحسب مرة واحدة." : "Debt is saved as negative automatically. You can also type a minus; it is applied only once."}
                {Number.isFinite(openingAccountBalance(type, initialBalance)) && <strong className="block mt-1">{language === "ar" ? "سيُحفظ: " : "Will save: "}<bdi dir="ltr">{openingAccountBalance(type, initialBalance).toFixed(2)} {currency || primaryCurrency}</bdi></strong>}
              </p>}
            </div>
            {type === "credit" && <div>
              <label htmlFor="account-credit-limit" className="text-xs font-medium text-muted-foreground mb-1 block">{language === "ar" ? "الحد الائتماني / ليميت السحب (اختياري)" : "Credit limit (optional)"}</label>
              <input id="account-credit-limit" type="text" inputMode="decimal" value={creditLimit} onChange={e => setCreditLimit(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" placeholder={language === "ar" ? "مثلاً: 2000" : "e.g. 2000"} />
              <p className="text-xs text-muted-foreground mt-1">{language === "ar" ? "الحد الكلي للبطاقة بنفس عملة الحساب، وليس رصيداً إضافياً." : "Total card limit in the account currency; it does not add to your balance."}</p>
            </div>}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {language === "ar" ? "لون الحساب" : "Account color"}
              </label>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-7 h-7 rounded-full transition-transform",
                      color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : "hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={c}
                    data-testid={`color-swatch-${c}`}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending || !name.trim()}
              className="w-full bg-primary text-primary-foreground py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              data-testid="btn-save-account"
            >
              {createMutation.isPending || updateMutation.isPending ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      )}

      {isError && accounts && <QueryFeedback ar={language === "ar"} retry={refetch} cached />}
      <div className="grid grid-cols-1 gap-3">
        {isError && !accounts ? <QueryFeedback ar={language === "ar"} retry={refetch} /> : isLoading ? (
          [1, 2, 3].map((i) => <div key={i} className="h-20 bg-card rounded-2xl border border-border animate-pulse" />)
        ) : accounts?.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{language === "ar" ? "ما في حسابات بعد" : "No accounts yet"}</p>
            <p className="text-sm text-muted-foreground mt-2">{language === "ar" ? "ضيف حساب الكاش أو البطاقة اللي بتستخدمها، وبعدها سجّل أول معاملة." : "Add the cash wallet or card you use, then record your first transaction."}</p>
            <button onClick={() => { resetForm(); setShowForm(true); }} className="mt-4 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold">{language === "ar" ? "إضافة أول حساب" : "Add your first account"}</button>
          </div>
        ) : (
          accounts?.map((account) => {
            const Icon = TYPE_ICON[account.type] ?? Wallet;
            return (
              <div key={account.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm flex flex-wrap gap-3 items-center justify-between" data-testid={`account-card-${account.id}`}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${account.color}1a` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: account.color }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground">{account.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{typeLabel(account.type)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-bold", account.currentBalance >= 0 ? "text-green-600" : "text-red-600")}>
                    {account.currentBalance.toFixed(2)} {account.currency}
                  </span>
                  <button onClick={() => startEdit(account)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" aria-label={language === "ar" ? "تعديل" : "Edit"} data-testid={`btn-edit-account-${account.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(account.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" aria-label={language === "ar" ? "حذف" : "Delete"} disabled={deleteMutation.isPending} data-testid={`btn-delete-account-${account.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {account.type === "credit" && account.creditLimit != null && <div className="w-full border-t border-border pt-3 text-xs flex flex-wrap gap-3">
                  <span>{language === "ar" ? "الليميت: " : "Limit: "}{account.creditLimit.toFixed(2)} {account.currency}</span>
                  <span>{language === "ar" ? "المتاح: " : "Available: "}{creditAvailability(account.currentBalance, account.creditLimit).toFixed(2)} {account.currency}</span>
                  {account.currentBalance + account.creditLimit < 0 && <span className="text-destructive font-semibold">{language === "ar" ? "تجاوزت الحد بمقدار " : "Over limit by "}{(-(account.currentBalance + account.creditLimit)).toFixed(2)} {account.currency}</span>}
                </div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
