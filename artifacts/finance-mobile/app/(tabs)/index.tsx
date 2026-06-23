import { useGetDashboardSummary, useGetRecentTransactions } from "@workspace/api-client-react";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSettings, getCurrencySymbol } from "@/contexts/SettingsContext";
import { useTr } from "@/lib/i18n";

type TxType = "income" | "expense" | "payment" | "receipt";

function isIncoming(type: string) {
  return type === "income" || type === "receipt";
}

function toAed(amount: number, currency: string, rates: Record<string, number>): number {
  if (currency === "AED") return amount;
  const rate = rates[currency];
  if (!rate) return amount;
  return amount * rate;
}

function fromAed(aedAmount: number, targetCurrency: string, rates: Record<string, number>): number {
  if (targetCurrency === "AED") return aedAmount;
  const rate = rates[targetCurrency];
  if (!rate) return aedAmount;
  return aedAmount / rate;
}

function formatDate(dateStr: string, lang: string) {
  try {
    return new Date(dateStr).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short" });
  } catch {
    return dateStr;
  }
}

function txLabel(type: TxType, t: ReturnType<typeof useTr>) {
  if (type === "income") return t("typeIncome");
  if (type === "expense") return t("typeExpense");
  if (type === "payment") return t("typePayment");
  if (type === "receipt") return t("typeReceipt");
  return t("transactions");
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings, effectiveRates } = useSettings();
  const { primaryCurrency, language } = settings;
  const t = useTr(language);
  const bottomPadFab = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: summary, isLoading: sumLoading, refetch: refetchSummary, isRefetching } =
    useGetDashboardSummary();
  const { data: recentTxs, isLoading: txLoading, refetch: refetchTx } =
    useGetRecentTransactions();

  const isLoading = sumLoading || txLoading;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const currencies: Array<{ currency: string; balance: number; totalIncome: number; totalExpenses: number }> =
    (summary as any)?.currencies ?? [];

  const totalBalanceAED = currencies.reduce(
    (sum, c) => sum + toAed(c.balance, c.currency, effectiveRates),
    0
  );
  const totalInPrimary = fromAed(totalBalanceAED, primaryCurrency, effectiveRates);

  const totalIncome = currencies.reduce(
    (sum, c) => sum + toAed(c.totalIncome, c.currency, effectiveRates),
    0
  );
  const totalExpenses = currencies.reduce(
    (sum, c) => sum + toAed(c.totalExpenses, c.currency, effectiveRates),
    0
  );

  const totalClients: number = (summary as any)?.totalClients ?? 0;
  const activeTrips: number = (summary as any)?.activeTrips ?? 0;
  const pendingTransactions: number = (summary as any)?.pendingTransactions ?? 0;

  const incomeExpenseCurrencies = currencies.filter(
    (c) => c.totalIncome > 0 || c.totalExpenses > 0
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: topPad + 16, paddingBottom: bottomPad + 120 }]}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => { refetchSummary(); refetchTx(); }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.topRow}>
        <Text style={[styles.greeting, { color: colors.foreground }]}>لوحة التحكم</Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={() => router.push("/(tabs)/transactions?openAdd=1")}
            hitSlop={12}
            style={[styles.iconBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
          >
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => router.push("/(tabs)/settings")}
            hitSlop={12}
            style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Feather name="settings" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {/* Total Balance Hero Card */}
          <View style={[
            styles.heroCard,
            {
              backgroundColor: totalInPrimary >= 0 ? colors.primary : "#ef4444",
            }
          ]}>
            <Text style={styles.heroLabel}>إجمالي الرصيد</Text>
            <Text style={styles.heroAmount}>
              {Math.abs(totalInPrimary).toLocaleString("ar", { maximumFractionDigits: 0 })}
            </Text>
            <Text style={styles.heroCurrency}>{primaryCurrency}</Text>

            <View style={styles.heroStats}>
              <View style={styles.heroStatItem}>
                <Feather name="users" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroStatValue}>{totalClients}</Text>
                <Text style={styles.heroStatLabel}>عميل</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Feather name="package" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroStatValue}>{activeTrips}</Text>
                <Text style={styles.heroStatLabel}>رحلة نشطة</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Feather name="clock" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroStatValue}>{pendingTransactions}</Text>
                <Text style={styles.heroStatLabel}>{t("pendingTransactions")}</Text>
              </View>
            </View>
          </View>

          {/* Income / Expenses */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="trending-up" size={18} color="#16a34a" />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {fromAed(totalIncome, primaryCurrency, effectiveRates).toLocaleString("ar", { maximumFractionDigits: 0 })}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>إجمالي الدخل ({primaryCurrency})</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="trending-down" size={18} color="#ef4444" />
              <Text style={[styles.statValue, { color: colors.foreground }]}>
                {fromAed(totalExpenses, primaryCurrency, effectiveRates).toLocaleString("ar", { maximumFractionDigits: 0 })}
              </Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>إجمالي المصاريف ({primaryCurrency})</Text>
            </View>
          </View>

          {/* Per-Currency Breakdown */}
          {currencies.filter(c => c.balance !== 0).length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 20 }]}>
                الأرصدة بالعملات
              </Text>
              <View style={styles.balanceRow}>
                {currencies.filter(c => c.balance !== 0 || ["AED", "USD", "SYP"].includes(c.currency)).slice(0, 4).map((c) => (
                  <BalanceCard
                    key={c.currency}
                    currency={c.currency}
                    amount={c.balance}
                    colors={colors}
                  />
                ))}
              </View>
            </>
          )}

          {/* Per-Currency Income / Expense Breakdown */}
          {incomeExpenseCurrencies.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 20 }]}>
                {t("income")} / {t("expense")}
              </Text>
              {incomeExpenseCurrencies.map((c) => (
                <View
                  key={c.currency}
                  style={[styles.ieCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.ieHeader}>
                    <Text style={[styles.currencyCode, { color: colors.foreground }]}>{c.currency}</Text>
                  </View>
                  <View style={styles.ieRow}>
                    <View style={styles.ieItem}>
                      <Feather name="trending-up" size={14} color="#16a34a" />
                      <Text style={[styles.ieLabel, { color: colors.mutedForeground }]}>{t("income")}</Text>
                      <Text style={[styles.ieValue, { color: "#16a34a" }]}>
                        {getCurrencySymbol(c.currency)} {Number(c.totalIncome).toLocaleString("ar", { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                    <View style={styles.ieItem}>
                      <Feather name="trending-down" size={14} color="#ef4444" />
                      <Text style={[styles.ieLabel, { color: colors.mutedForeground }]}>{t("expense")}</Text>
                      <Text style={[styles.ieValue, { color: "#ef4444" }]}>
                        {getCurrencySymbol(c.currency)} {Number(c.totalExpenses).toLocaleString("ar", { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}


          {/* Recent Transactions */}
          <Text style={[styles.sectionTitle, { color: colors.mutedForeground, marginTop: 20 }]}>
            آخر المعاملات
          </Text>

          {!recentTxs || recentTxs.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="inbox" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد معاملات بعد</Text>
            </View>
          ) : (
            (recentTxs as any[]).slice(0, 5).map((tx: any) => (
              <View key={tx.id} style={[styles.txRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[
                  styles.txIcon,
                  { backgroundColor: isIncoming(tx.type) ? "#dcfce7" : "#fee2e2" }
                ]}>
                  <Feather
                    name={isIncoming(tx.type) ? "arrow-down-left" : "arrow-up-right"}
                    size={16}
                    color={isIncoming(tx.type) ? "#16a34a" : "#ef4444"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.txNote, { color: colors.foreground }]} numberOfLines={1}>
                    {tx.notes || tx.clientName || txLabel(tx.type as TxType, t)}
                  </Text>
                  <Text style={[styles.txDate, { color: colors.mutedForeground }]}>{formatDate(tx.date, language)}</Text>
                </View>
                <Text style={[
                  styles.txAmount,
                  { color: isIncoming(tx.type) ? "#16a34a" : "#ef4444" }
                ]}>
                  {isIncoming(tx.type) ? "+" : "-"}{Number(tx.amount).toLocaleString(language === "ar" ? "ar" : "en")} {tx.currency}
                </Text>
              </View>
            ))
          )}
        </>
      )}
    </ScrollView>

    {/* Floating voice mic button */}
    <Pressable
      onPress={() => router.push("/(tabs)/transactions?openVoice=1")}
      style={[
        styles.fab,
        {
          backgroundColor: colors.primary,
          bottom: bottomPadFab + 90,
        },
      ]}
    >
      <Feather name="mic" size={24} color="#fff" />
    </Pressable>
    </View>
  );
}

function BalanceCard({ currency, amount, colors }: { currency: string; amount: number; colors: any }) {
  const num = typeof amount === "string" ? parseFloat(amount || "0") : (amount ?? 0);
  const colorMap: Record<string, string> = {
    AED: "#f59e0b",
    USD: "#16a34a",
    SYP: "#8b5cf6",
    EUR: "#3b82f6",
    SAR: "#ef4444",
    TRY: "#ec4899",
  };
  const dotColor = colorMap[currency] ?? "#788090";
  return (
    <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.currencyDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.currencyCode, { color: colors.foreground }]}>{currency}</Text>
      <Text style={[styles.balanceAmount, { color: num >= 0 ? "#16a34a" : "#ef4444" }]}>
        {num >= 0 ? "" : "-"}{Math.abs(num).toLocaleString("ar", { maximumFractionDigits: 0 })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
    gap: 4,
  },
  heroLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginTop: 4,
  },
  heroCurrency: {
    fontSize: 16,
    color: "rgba(255,255,255,0.9)",
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    gap: 20,
  },
  heroStatItem: {
    alignItems: "center",
    gap: 2,
    flexDirection: "row",
  },
  heroStatValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    color: "#fff",
    fontFamily: "Inter_700Bold",
    marginLeft: 4,
  },
  heroStatLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    fontFamily: "Inter_400Regular",
    marginLeft: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 20,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  ratesCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 4,
  },
  rateRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  rateValue: {
    fontSize: 15,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
  },
  rateCurrency: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  container: {
    paddingHorizontal: 16,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  greeting: {
    fontSize: 22,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    textAlign: "right",
  },
  balanceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  balanceCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 2,
    minWidth: 80,
    flex: 1,
  },
  currencyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 4,
  },
  currencyCode: {
    fontSize: 13,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
  },
  balanceAmount: {
    fontSize: 16,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
  },
  ieCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 10,
  },
  ieHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  ieRow: {
    flexDirection: "row",
    gap: 16,
  },
  ieItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  ieLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  ieValue: {
    fontSize: 13,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    marginLeft: "auto",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  txNote: {
    fontSize: 14,
    fontWeight: "500" as const,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  txDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    gap: 8,
    borderStyle: "dashed",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
});
