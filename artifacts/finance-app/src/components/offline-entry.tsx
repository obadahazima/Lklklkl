import { TERMS_VERSION } from "./consent-gate";
import { useEffect, useRef, useState } from "react";
import { localISODate, normalizeAmountInput, transactionError, manualErrorMessage, useManualDraft, useOfflineLedger, type ManualDraft } from "@workspace/api-client-react";
import { webLedger } from "@/lib/offline-ledger";
import { OfflineQueuePanel } from "./offline-ledger";

export function OfflineEntry() {
  const [owner, setOwner] = useState<string | null | undefined>(undefined);
  useEffect(() => { void webLedger.storage.activeOwner().then(setOwner, () => setOwner(null)); }, []);
  if (!owner) return <main dir="rtl" className="p-8 max-w-lg mx-auto space-y-4"><h1 className="text-xl font-bold">Billy Bills AI — بدون إنترنت</h1><p>{owner === undefined ? "جارٍ فتح بيانات الجهاز…" : "يلزم تسجيل الدخول وتحميل حساباتك مرة واحدة وأنت متصل قبل الإدخال بدون إنترنت."}</p></main>;
  return <OfflineManualForm owner={owner} />;
}

function OfflineManualForm({ owner }: { owner: string }) {
  const { record, ready: cacheReady } = useOfflineLedger(webLedger, owner);
  const [form, setForm, draft] = useManualDraft<ManualDraft>(webLedger, owner, { type: "expense", amount: "", currency: record.references.primaryCurrency ?? "AED", accountId: "", toAccountId: "", clientId: "", tripId: "", date: localISODate(), description: "", status: "pending" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const accounts = record.references.accounts ?? [];
  const currencies = [...new Set([form.currency, ...(record.references.currencies ?? []), ...accounts.map((account) => account.currency)])];
  useEffect(() => { if (draft.ready && !form.accountId && !form.amount && accounts.length === 1) setForm((old) => ({ ...old, accountId: String(accounts[0].id), currency: record.references.primaryCurrency ?? accounts[0].currency })); }, [draft.ready, accounts, record.references.primaryCurrency]);
  const update = (field: keyof ManualDraft, value: string) => setForm((old) => ({ ...old, [field]: value }));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || !draft.ready) return;
    const payload = { type: form.type, amount: normalizeAmountInput(form.amount), currency: form.currency, date: form.date, status: form.status, accountId: Number(form.accountId), toAccountId: form.type === "transfer" ? Number(form.toAccountId) : null, clientId: form.type === "transfer" ? null : form.clientId ? Number(form.clientId) : null, tripId: form.type === "transfer" ? null : form.tripId ? Number(form.tripId) : null, description: form.description || null };
    const error = transactionError(payload);
    if (error) { setMessage(manualErrorMessage(error, true)); return; }
    busy.current = true; setSaving(true);
    try {
      await webLedger.enqueue(owner, payload, draft.id);
      const next = { ...form, amount: "", description: "", clientId: "", tripId: "", toAccountId: "", date: localISODate() };
      const nextDraft = { id: webLedger.uuid(), values: next };
      await webLedger.saveDraft(owner, nextDraft.id, next).catch(() => {});
      draft.restore(nextDraft);
      setMessage("حُفظت على الجهاز بانتظار الاتصال وتسجيل الدخول للمزامنة");
    } catch { setMessage("تعذر الحفظ المحلي؛ أبقِ الصفحة مفتوحة ولا تمسح بيانات المتصفح"); }
    finally { busy.current = false; setSaving(false); }
  }
  if (cacheReady && record.references.consentVersion !== TERMS_VERSION) return <main dir="rtl" className="p-8">اتصل وسجّل الدخول مرة واحدة لتحديث بيانات الحساب والموافقة قبل استخدام الإدخال المحلي. <a href="/" className="text-blue-700 underline">فتح حسابي</a></main>;
  const fieldClass = "w-full border border-slate-300 rounded-lg p-3 bg-white text-slate-900";
  return <main dir="rtl" className="p-4 max-w-lg mx-auto space-y-4 text-slate-900 bg-slate-50 min-h-screen">
    <h1 className="text-xl font-bold">إدخال يدوي بدون إنترنت</h1>
    <a href="/" className="block text-blue-700 underline">رجوع لحسابي والمزامنة عند توفر الإنترنت</a>
    <p>تستخدم نسخة حساباتك المحفوظة على هذا الجهاز. المزامنة تبدأ بعد رجوع الاتصال وتوثيق حسابك.</p>
    <OfflineQueuePanel owner={owner} onRecover={draft.restore} />
    {!accounts.length && <p role="alert">ما في حسابات محفوظة بعد؛ اتصل بالإنترنت وافتح حساباتك مرة واحدة.</p>}
    <form onSubmit={save} className="space-y-3">
      <label className="block">المبلغ<input className={fieldClass} autoFocus inputMode="decimal" value={form.amount} onChange={(event) => update("amount", event.target.value)} required /></label>
      <label className="block">نوع المعاملة<select className={fieldClass} value={form.type} onChange={(event) => update("type", event.target.value)}>{[["expense","مصروف"],["income","دخل"],["payment","دفع لزبون"],["receipt","قبض من زبون"],["transfer","تحويل بين حساباتي"]].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block">العملة<select className={fieldClass} value={form.currency} onChange={(event) => update("currency",event.target.value)}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></label>
      <label className="block">الحساب<select className={fieldClass} value={form.accountId} onChange={(event) => update("accountId",event.target.value)} required><option value="">اختر حساباً</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
      {form.type === "transfer" ? <label className="block">إلى حساب<select className={fieldClass} value={form.toAccountId} onChange={(event) => update("toAccountId",event.target.value)} required><option value="">اختر الوجهة</option>{accounts.filter((account) => String(account.id) !== form.accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label> : <>
        <label className="block">الزبون<select className={fieldClass} value={form.clientId} onChange={(event) => update("clientId",event.target.value)}><option value="">بدون زبون</option>{record.references.clients?.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label className="block">الرحلة<select className={fieldClass} value={form.tripId} onChange={(event) => update("tripId",event.target.value)}><option value="">بدون رحلة</option>{record.references.trips?.map((trip) => <option key={trip.id} value={trip.id}>{trip.name}</option>)}</select></label>
      </>}
      <label className="block">التاريخ<input type="date" className={fieldClass} value={form.date} onChange={(event) => update("date",event.target.value)} required /></label>
      <label className="block">الحالة<select className={fieldClass} value={form.status} onChange={(event) => update("status",event.target.value)}><option value="pending">معلقة</option><option value="settled">مسددة</option></select></label>
      <label className="block">الوصف<input className={fieldClass} value={form.description} onChange={(event) => update("description",event.target.value)} /></label>
      <button disabled={saving || !draft.ready || !accounts.length} className="w-full p-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-50">حفظ وإضافة أخرى</button>
    </form>
    {(message || draft.error) && <p role="status">{message || "تعذر حفظ المسودة محلياً"}</p>}
  </main>;
}
