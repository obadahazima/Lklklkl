import { useGetClientStatement } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/contexts/SettingsContext";
import { useTr } from "@/lib/i18n";
import { exportStatementPdf, type ExportOptions } from "@/lib/export";

function formatDate(d: string, lang: string) {
  try { return new Date(d).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function typeColor(t: string) {
  if (t === "income" || t === "receipt") return "#16a34a";
  if (t === "expense" || t === "payment") return "#ef4444";
  return "#2563eb";
}

function toPrimary(amount: number, currency: string, rates: Record<string, number>, primary: string) {
  const inAed = currency === "AED" ? amount : amount * (rates[currency] ?? 1);
  if (primary === "AED") return inAed;
  return inAed / (rates[primary] ?? 1);
}

export default function ClientStatementScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = parseInt(id);
  const { settings } = useSettings();
  const { language, primaryCurrency, exchangeRateMode, manualRates } = settings;
  const t = useTr(language);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading } = useGetClientStatement(clientId, { query: { enabled: !!clientId } });

  const handleShare = async () => {
    if (!data) return;
    const { client, transactions, balances } = data as any;
    const apiRates = (data as any).exchangeRates as Record<string, number> | undefined;
    const effectiveRates = exchangeRateMode === "manual" ? manualRates : (apiRates ?? manualRates);
    const totalInPrimary = (balances as any[]).reduce(
      (sum: number, b: any) => sum + toPrimary(b.openBalance, b.currency, effectiveRates, primaryCurrency),
      0
    );

    const opts: ExportOptions = {
      title: client.name,
      subtitle: t("statement"),
      transactions: (transactions as any[]).map((tx: any) => ({
        date: tx.date,
        type: tx.type,
        description: tx.description,
        amount: Number(tx.amount),
        currency: tx.currency,
      })),
      totals: (balances as any[]).map((b: any) => ({
        currency: b.currency,
        paid: Number(b.paid),
        received: Number(b.received),
        openBalance: Number(b.openBalance),
      })),
      primaryCurrency,
      primaryTotal: Math.round(totalInPrimary * 100) / 100,
    };

    try {
      await exportStatementPdf(opts);
    } catch {
      try {
        await Share.share({ message: `${client.name} — ${t("statement")}` });
      } catch {
        /* noop */
      }
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: colors.mutedForeground }}>لم يتم العثور على العميل</Text>
      </View>
    );
  }

  const { client, transactions, balances } = data as any;
  const apiRates = (data as any).exchangeRates as Record<string, number> | undefined;
  const effectiveRates = exchangeRateMode === "manual" ? manualRates : (apiRates ?? manualRates);

  const totalInPrimary = balances.reduce(
    (sum: number, b: any) => sum + toPrimary(b.openBalance, b.currency, effectiveRates, primaryCurrency),
    0
  );

  const initials = (name: string) =>
    name.split(" ").slice(0, 2).map((w: string) => w[0] ?? "").join("").toUpperCase();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: bottomPad + 80 }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name={language === "ar" ? "arrow-right" : "arrow-left"} size={20} color={colors.foreground} />
        </Pressable>
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(client.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.clientName, { color: colors.foreground }]}>{client.name}</Text>
          {client.phone ? (
            <Text style={[styles.clientPhone, { color: colors.mutedForeground }]}>{client.phone}</Text>
          ) : (
            <Text style={[styles.clientPhone, { color: colors.mutedForeground }]}>كشف الحساب</Text>
          )}
        </View>
        <Pressable
          onPress={handleShare}
          style={[styles.shareBtn, { backgroundColor: colors.accent }]}
          hitSlop={8}
        >
          <Feather name="share-2" size={16} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {/* Total card */}
        <View style={[
          styles.totalCard,
          {
            backgroundColor: totalInPrimary === 0 ? colors.card : totalInPrimary > 0 ? "#f0fdf4" : "#fef2f2",
            borderColor: totalInPrimary === 0 ? colors.border : totalInPrimary > 0 ? "#bbf7d0" : "#fecaca",
          }
        ]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Feather name="credit-card" size={14} color={colors.mutedForeground} />
            <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>الإجمالي بـ {primaryCurrency}</Text>
            <View style={[styles.currencyTag, { backgroundColor: colors.muted }]}>
              <Text style={[styles.currencyTagText, { color: colors.foreground }]}>{primaryCurrency}</Text>
            </View>
          </View>
          <Text style={[
            styles.totalValue,
            { color: totalInPrimary === 0 ? colors.foreground : totalInPrimary > 0 ? "#16a34a" : "#ef4444" }
          ]}>
            {totalInPrimary === 0
              ? "مسدد بالكامل"
              : `${totalInPrimary > 0 ? "له " : "عليه "}${Math.abs(totalInPrimary).toLocaleString("ar", { maximumFractionDigits: 0 })} ${primaryCurrency}`}
          </Text>
        </View>

        {/* Balances per currency */}
        {balances.length > 0 && (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>الأرصدة المفتوحة</Text>
            <View style={{ gap: 8 }}>
              {balances.map((b: any) => (
                <View key={b.currency} style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>مدفوع</Text>
                        <Text style={{ fontSize: 12, color: "#ef4444", fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" }}>
                          {Number(b.paid).toLocaleString("ar")}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>مقبوض</Text>
                        <Text style={{ fontSize: 12, color: "#16a34a", fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" }}>
                          {Number(b.received).toLocaleString("ar")}
                        </Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <View style={[styles.currencyTag, { backgroundColor: colors.accent }]}>
                        <Text style={[styles.currencyTagText, { color: colors.primary }]}>{b.currency}</Text>
                      </View>
                      <Text style={[
                        styles.balanceAmount,
                        { color: b.openBalance >= 0 ? "#16a34a" : "#ef4444" }
                      ]}>
                        {b.openBalance === 0
                          ? "مسدد"
                          : `${b.openBalance > 0 ? "له " : "عليه "}${Math.abs(b.openBalance).toLocaleString("ar", { maximumFractionDigits: 0 })}`}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Transactions */}
        <View>
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>
            المعاملات ({transactions.length})
          </Text>
          {transactions.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد معاملات لهذا العميل</Text>
            </View>
          ) : (
            <View style={[styles.txList, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {transactions.map((tx: any, i: number) => (
                <View
                  key={tx.id}
                  style={[
                    styles.txRow,
                    { borderBottomColor: colors.border },
                    i === transactions.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={[styles.txDot, { backgroundColor: typeColor(tx.type) }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      <Text style={[styles.txType, { color: typeColor(tx.type) }]}>
                      {tx.type === "income" ? t("typeIncome") : tx.type === "expense" ? t("typeExpense") : tx.type === "payment" ? t("typePayment") : t("typeReceipt")}
                    </Text>
                    </View>
                    <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{formatDate(tx.date, language)}</Text>
                    {tx.description ? (
                      <Text style={[styles.txDesc, { color: colors.mutedForeground }]} numberOfLines={1}>{tx.description}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.txAmount, { color: typeColor(tx.type) }]}>
                      {tx.type === "expense" || tx.type === "payment" ? "-" : "+"}
                      {Number(tx.amount).toLocaleString("ar")} {tx.currency}
                    </Text>
                    {tx.currency !== primaryCurrency && (
                      <Text style={[styles.txConvert, { color: colors.mutedForeground }]}>
                        ≈ {tx.type === "expense" || tx.type === "payment" ? "-" : "+"}
                        {Math.abs(toPrimary(Number(tx.amount), tx.currency, effectiveRates, primaryCurrency)).toLocaleString("ar", { maximumFractionDigits: 0 })} {primaryCurrency}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
              {/* Total row */}
              <View style={[styles.txTotalRow, { backgroundColor: colors.muted }]}>
                <Text style={[styles.txTotalLabel, { color: colors.mutedForeground }]}>الإجمالي ({primaryCurrency})</Text>
                <Text style={[styles.txTotalValue, { color: totalInPrimary >= 0 ? "#16a34a" : "#ef4444" }]}>
                  {totalInPrimary >= 0 ? "+" : ""}{totalInPrimary.toLocaleString("ar", { maximumFractionDigits: 0 })}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  shareBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 16, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  clientName: { fontSize: 17, fontWeight: "700" as const, fontFamily: "Inter_700Bold", textAlign: "right" },
  clientPhone: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right" },
  totalCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  totalLabel: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  totalValue: { fontSize: 22, fontWeight: "700" as const, fontFamily: "Inter_700Bold", textAlign: "right" },
  currencyTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  currencyTagText: { fontSize: 10, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  sectionTitle: {
    fontSize: 11, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, textAlign: "right",
  },
  balanceCard: { borderRadius: 12, padding: 12, borderWidth: 1 },
  balanceAmount: { fontSize: 16, fontWeight: "700" as const, fontFamily: "Inter_700Bold", textAlign: "right" },
  emptyBox: { borderWidth: 1, borderRadius: 12, padding: 24, alignItems: "center", borderStyle: "dashed" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  txList: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  txRow: { flexDirection: "row", alignItems: "flex-start", padding: 12, borderBottomWidth: 1, gap: 10 },
  txDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0 },
  txType: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  txDate: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "right" },
  txDesc: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, textAlign: "right" },
  txAmount: { fontSize: 13, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  txConvert: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  txTotalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 10,
  },
  txTotalLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  txTotalValue: { fontSize: 14, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
});
