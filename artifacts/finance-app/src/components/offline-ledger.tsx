import { useToast } from "@/hooks/use-toast";
import { TERMS_VERSION } from "./consent-gate";
import { useSettings } from "@/contexts/settings-context";
import { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useOfflineLedger, useListAccounts, useListClients, useListTrips, useListTransactions, type ManualDraft } from "@workspace/api-client-react";
import { webLedger } from "@/lib/offline-ledger";

export function OfflineSyncBridge() {
  const { userId, isLoaded } = useAuth();
  const { user } = useUser();
  const accepted = (user?.publicMetadata as { consent?: { version?: string } } | undefined)?.consent?.version === TERMS_VERSION;
  const qc = useQueryClient();
  const { settings } = useSettings();
  const enabled = !!userId && isLoaded && accepted;
  const accounts = useListAccounts({ query: { queryKey: ["offline-reference", userId, "accounts"], enabled } });
  const clients = useListClients({ query: { queryKey: ["offline-reference", userId, "clients"], enabled } });
  const trips = useListTrips({ query: { queryKey: ["offline-reference", userId, "trips"], enabled } });
  const transactions = useListTransactions({}, { query: { queryKey: ["offline-reference", userId, "transactions"], enabled } });
  useEffect(() => {
    if (!isLoaded) return;
    void webLedger.activate(enabled ? userId! : null).catch(() => {});
    const sync = () => { void webLedger.flush(); };
    window.addEventListener("online", sync);
    const timer = setInterval(sync, 20_000);
    return () => { window.removeEventListener("online", sync); clearInterval(timer); };
  }, [userId, isLoaded, enabled]);
  useEffect(() => {
    if (!userId || !enabled) return;
    const refs = { consentVersion: TERMS_VERSION, language: settings.language, primaryCurrency: settings.primaryCurrency, currencies: settings.currencies, ...(accounts.data ? { accounts: accounts.data } : {}), ...(clients.data ? { clients: clients.data } : {}), ...(trips.data ? { trips: trips.data } : {}), ...(transactions.data ? { transactions: transactions.data } : {}) };
    if (Object.keys(refs).length) void webLedger.remember(userId, refs).catch(() => {});
  }, [userId, enabled, accounts.data, clients.data, trips.data, transactions.data, settings.language, settings.primaryCurrency, settings.currencies]);
  useEffect(() => qc.getMutationCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const kind = String(event.mutation.options.mutationKey?.[0] ?? "");
    if (/^(create|update|delete)(Account|Client|Trip|Transaction)$/.test(kind) || kind === "aiQuery") {
      void qc.invalidateQueries({ queryKey: ["offline-reference", userId] });
    }
  }), [qc, userId]);
  const { toast } = useToast();
  const revision = useRef(webLedger.syncRevision);
  useEffect(() => webLedger.subscribe(() => {
    if (revision.current !== webLedger.syncRevision) { revision.current = webLedger.syncRevision; void qc.invalidateQueries(); if(userId) void webLedger.read(userId).then(r=>{const latest=r.references.transactions?.[0]; if(latest?.collectionSummary) toast({title:settings.language === "ar" ? "تم التحصيل" : "Collection recorded",description:latest.collectionSummary});}); }
  }), [qc]);
  return null;
}

export function OfflineQueuePanel({ owner, ar = true, onRecover, cached = false }: { cached?: boolean; owner?: string | null; ar?: boolean; onRecover?: (draft: { id: string; values: ManualDraft }) => void }) {
  const { record, storageError } = useOfflineLedger(webLedger, owner);
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState("");
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  if (online && !record.outbox.length && !storageError && !error && !cached) return null;
  return <aside className="max-h-60 overflow-y-auto rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900 space-y-2" role="status" dir={ar ? "rtl" : "ltr"}>
    <p>{online ? (ar ? "المزامنة مع حسابك" : "Syncing your account") : (ar ? "بدون إنترنت — المعاملات الجديدة تُحفظ على هذا الجهاز" : "Offline — new transactions are saved on this device")}</p>
    <p>{ar ? "الأرصدة قد لا تشمل المعاملات بانتظار المزامنة. لا تمسح بيانات التطبيق قبل اكتمالها." : "Balances may exclude pending transactions. Keep app data until syncing finishes."}</p>
    {record.references.updatedAt && <p className="text-xs">{ar ? "آخر نسخة محلية: " : "Local snapshot: "}{new Date(record.references.updatedAt).toLocaleString()}</p>}
    {(storageError || error) && <p className="text-red-700">{error || (ar ? "تعذر الوصول للتخزين المحلي؛ لا تغلق النموذج قبل حل المشكلة" : "Local storage unavailable; keep this form open")}</p>}
    {record.outbox.map((item) => <div key={item.id} className="border-t border-amber-200 pt-2 flex flex-wrap items-center gap-2">
      <span>{item.payload.date} · {item.payload.amount} {item.payload.currency} · {item.payload.description}</span>
      <strong>{item.state === "blocked" ? (ar ? "تحتاج مراجعة" : "Needs review") : (ar ? "بانتظار المزامنة" : "Pending sync")}</strong>
      {item.error && <span className="text-red-700">{item.error}</span>}
      {item.state === "blocked" && [400, 404, 422].includes(item.status ?? 0) && onRecover && <button type="button" className="underline" onClick={() => { if (owner) void webLedger.recover(owner, item.id).then(onRecover, (err) => setError(String(err.message))); }}>{ar ? "تعديل" : "Edit"}</button>}
      <button type="button" className="underline" onClick={() => { if (owner) void webLedger.retry(owner, item.id).catch((err) => setError(String(err.message))); }}>{ar ? "إعادة المحاولة" : "Retry"}</button>
    </div>)}
  </aside>;
}
