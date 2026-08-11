import { useState } from "react";
import {
  useListAccounts,
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
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language, primaryCurrency } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const { data: accounts, isLoading } = useListAccounts();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setName("");
    setType("cash");
    setCurrency(primaryCurrency || "AED");
    setInitialBalance("0");
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
    setColor(account.color || ACCOUNT_COLORS[0]);
    setShowForm(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        data: { name: name.trim(), type, currency, color, initialBalance: parseFloat(initialBalance) || 0 },
      });
    } else {
      createMutation.mutate({
        data: { name: name.trim(), type, currency: currency || primaryCurrency || "AED", color, initialBalance: parseFloat(initialBalance) || 0 },
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
            {accounts?.length ?? 0} {language === "ar" ? "حساب" : "accounts"}
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
            <button onClick={resetForm} className="text-muted-foreground">
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
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {language === "ar" ? "الرصيد الابتدائي (اختياري)" : "Initial balance (optional)"}
              </label>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="input-account-initial-balance"
              />
            </div>
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
              {t("save")}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {isLoading ? (
          [1, 2, 3].map((i) => <div key={i} className="h-20 bg-card rounded-2xl border border-border animate-pulse" />)
        ) : accounts?.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">{language === "ar" ? "ما في حسابات بعد" : "No accounts yet"}</p>
          </div>
        ) : (
          accounts?.map((account) => {
            const Icon = TYPE_ICON[account.type] ?? Wallet;
            return (
              <div key={account.id} className="bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between" data-testid={`account-card-${account.id}`}>
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
                  <button onClick={() => startEdit(account)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" data-testid={`btn-edit-account-${account.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(account.id)} className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive" data-testid={`btn-delete-account-${account.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
