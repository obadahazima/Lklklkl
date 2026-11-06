import { TERMS_VERSION } from "@/constants/legal";
import { useSettings } from "@/contexts/SettingsContext";
import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { AppState, View, Text, Pressable, Alert, ScrollView } from "react-native";
import { useOfflineLedger, useListAccounts, useListClients, useListTrips, useListTransactions, type ManualDraft } from "@workspace/api-client-react";
import { mobileLedger } from "@/lib/offline-ledger";

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
  const previousOwner = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    if (previousOwner.current !== undefined && previousOwner.current !== userId) qc.clear();
    previousOwner.current = userId;
    void mobileLedger.activate(enabled ? userId! : null).catch(() => {});
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") void mobileLedger.flush(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void mobileLedger.flush(); }, 20_000);
    return () => { subscription.remove(); clearInterval(timer); };
  }, [userId, isLoaded, enabled, qc]);
  useEffect(() => {
    if (!userId || !enabled) return;
    const refs = { consentVersion: TERMS_VERSION, language: settings.language, primaryCurrency: settings.primaryCurrency, currencies: settings.currencies, ...(accounts.data ? { accounts: accounts.data } : {}), ...(clients.data ? { clients: clients.data } : {}), ...(trips.data ? { trips: trips.data } : {}), ...(transactions.data ? { transactions: transactions.data } : {}) };
    if (Object.keys(refs).length) void mobileLedger.remember(userId, refs).catch(() => {});
  }, [userId, enabled, accounts.data, clients.data, trips.data, transactions.data, settings.language, settings.primaryCurrency, settings.currencies]);
  useEffect(() => qc.getMutationCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const kind = String(event.mutation.options.mutationKey?.[0] ?? "");
    if (/^(create|update|delete)(Account|Client|Trip|Transaction)$/.test(kind) || kind === "aiQuery") {
      void qc.invalidateQueries({ queryKey: ["offline-reference", userId] });
    }
  }), [qc, userId]);
  const revision = useRef(mobileLedger.syncRevision);
  useEffect(() => mobileLedger.subscribe(() => { if (revision.current !== mobileLedger.syncRevision) { revision.current = mobileLedger.syncRevision; void qc.invalidateQueries(); if(userId) void mobileLedger.read(userId).then(r=>{const latest=r.references.transactions?.[0]; if(latest?.collectionSummary) Alert.alert(settings.language === "ar" ? "تم التحصيل" : "Collection recorded",latest.collectionSummary);}); } }), [qc]);
  return null;
}

export function OfflineQueuePanel({ owner, ar, onRecover, cached = false }: { cached?: boolean; owner?: string | null; ar: boolean; onRecover?: (draft: { id: string; values: ManualDraft }) => void }) {
  const { record, storageError } = useOfflineLedger(mobileLedger, owner);
  if (!record.outbox.length && !storageError && !cached) return null;
  return <ScrollView style={{ maxHeight: 220, backgroundColor: "#fffbeb" }} contentContainerStyle={{ padding: 12, gap: 6 }}>
    <Text style={{ color: "#92400e", textAlign: ar ? "right" : "left" }}>{ar ? "محفوظ على الجهاز — الأرصدة قد لا تشمل المعاملات بانتظار المزامنة. لا تمسح بيانات التطبيق قبل اكتمالها." : "Saved on this device — balances may exclude pending transactions. Keep app data until syncing finishes."}</Text>
    {storageError && <Text style={{ color: "#b91c1c" }}>{ar ? "التخزين المحلي غير متاح" : "Local storage unavailable"}</Text>}
    {record.outbox.map((item) => <View key={item.id} style={{ gap: 4, borderTopWidth: 1, borderColor: "#fde68a", paddingTop: 6 }}>
      <Text style={{ color: "#78350f" }}>{item.payload.date} · {item.payload.amount} {item.payload.currency} · {item.state === "blocked" ? (ar ? "تحتاج مراجعة" : "Needs review") : (ar ? "بانتظار المزامنة" : "Pending sync")}</Text>
      {!!item.error && <Text style={{ color: "#b91c1c" }}>{item.error}</Text>}
      <View style={{ flexDirection: "row", gap: 20 }}>
        {onRecover && item.state === "blocked" && [400, 404, 422].includes(item.status ?? 0) && <Pressable onPress={() => { if (owner) void mobileLedger.recover(owner, item.id).then(onRecover, (err) => Alert.alert(String(err.message))); }}><Text style={{ color: "#2563eb" }}>{ar ? "تعديل" : "Edit"}</Text></Pressable>}
        <Pressable onPress={() => { if (owner) void mobileLedger.retry(owner, item.id).catch((err) => Alert.alert(String(err.message))); }}><Text style={{ color: "#2563eb" }}>{ar ? "إعادة المحاولة" : "Retry"}</Text></Pressable>
      </View>
    </View>)}
  </ScrollView>;
}
