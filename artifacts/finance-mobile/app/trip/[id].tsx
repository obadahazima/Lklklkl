import { useGetTripPnl } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/contexts/SettingsContext";
import { useTr } from "@/lib/i18n";
import { exportStatementPdf } from "@/lib/export";

function statusLabel(s: string) {
  if (s === "active") return "نشطة";
  if (s === "completed") return "مكتملة";
  if (s === "cancelled") return "ملغاة";
  return s;
}

function statusColor(s: string) {
  if (s === "active") return "#2563eb";
  if (s === "completed") return "#16a34a";
  if (s === "cancelled") return "#ef4444";
  return "#788090";
}

function toPrimary(amount: number, currency: string, rates: Record<string, number>, primary: string): number {
  const inAed = currency === "AED" ? amount : amount * (rates[currency] ?? 1);
  if (primary === "AED") return inAed;
  return inAed / (rates[primary] ?? 1);
}

export default function TripDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useSettings();
  const t = useTr(settings.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const tripId = parseInt(id);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading } = useGetTripPnl(tripId, { query: { enabled: !!tripId } });

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
        <Text style={{ color: colors.mutedForeground }}>لم يتم العثور على الرحلة</Text>
      </View>
    );
  }

  const { trip, breakdown } = data as any;

  const rawTxs: { date: string; type: string; description?: string | null; amount: number; currency: string }[] =
    (data as any).transactions ?? [];
  const apiRates = (data as any).exchangeRates as Record<string, number> | undefined;
  const effectiveRates: Record<string, number> =
    settings.exchangeRateMode === "manual" ? settings.manualRates : (apiRates ?? settings.manualRates);
  const primaryCurrency = settings.primaryCurrency;

  const handleShare = async () => {
    try {
      const primaryTotal =
        Math.round(
          breakdown.reduce(
            (sum: number, b: any) => sum + toPrimary(b.netProfit, b.currency, effectiveRates, primaryCurrency),
            0,
          ) * 100,
        ) / 100;
      await exportStatementPdf({
        title: trip.name,
        subtitle: t("profitLoss"),
        transactions: rawTxs.map((tx) => ({
          date: tx.date,
          type: tx.type,
          description: tx.description,
          amount: tx.amount,
          currency: tx.currency,
        })),
        totals: breakdown.map((b: any) => ({
          currency: b.currency,
          paid: b.expenses,
          received: b.revenue,
          openBalance: b.netProfit,
        })),
        primaryCurrency,
        primaryTotal,
      });
    } catch {
      Alert.alert(t("share"), t("exportPdf"));
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: bottomPad + 80 }}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name={settings.language === "ar" ? "arrow-right" : "arrow-left"} size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <Text style={[styles.tripName, { color: colors.foreground }]}>{trip.name}</Text>
            {trip.isShared && (
              <View style={styles.sharedBadge}>
                <Text style={styles.sharedText}>مشتركة</Text>
              </View>
            )}
          </View>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>الأرباح والخسائر</Text>
        </View>
        <Pressable onPress={handleShare} style={[styles.shareBtn, { backgroundColor: colors.accent }]} accessibilityLabel={t("share")}>
          <Feather name="share-2" size={18} color={colors.primary} />
        </Pressable>
      </View>

      <View style={{ padding: 16, gap: 14 }}>
        {/* Status row */}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <View style={[styles.statusBadge, {
            backgroundColor: statusColor(trip.status) + "20",
          }]}>
            <Text style={[styles.statusText, { color: statusColor(trip.status) }]}>
              {statusLabel(trip.status)}
            </Text>
          </View>
          {(trip.origin || trip.destination) && (
            <Text style={[styles.routeText, { color: colors.mutedForeground }]}>
              {[trip.origin, trip.destination].filter(Boolean).join(settings.language === "ar" ? " ← " : " → ")}
            </Text>
          )}
        </View>

        {trip.isShared && (
          <View style={[styles.sharedNotice, { backgroundColor: "#f5f3ff", borderColor: "#c4b5fd" }]}>
            <Feather name="divide" size={14} color="#7c3aed" />
            <Text style={styles.sharedNoticeText}>رحلة مشتركة — صافي الربح يُقسّم على 2</Text>
          </View>
        )}

        {breakdown.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <Feather name="bar-chart-2" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد معاملات لهذه الرحلة</Text>
          </View>
        ) : (
          breakdown.map((b: any) => (
            <View key={b.currency} style={[styles.pnlCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Header row */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <View>
                  <Text style={[styles.netLabel, { color: colors.mutedForeground }]}>الربح الصافي</Text>
                  <Text style={[styles.netValue, { color: b.netProfit >= 0 ? "#16a34a" : "#ef4444" }]}>
                    {b.netProfit >= 0 ? "+" : ""}{Number(b.netProfit).toLocaleString("ar", { maximumFractionDigits: 0 })} {b.currency}
                  </Text>
                </View>
                <View style={[styles.currencyTag, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.currencyTagText, { color: colors.primary }]}>{b.currency}</Text>
                </View>
              </View>

              {/* Revenue & Expenses */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={[styles.metricBox, { backgroundColor: colors.card, borderWidth: 1, borderColor: "#16a34a22", flex: 1 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <Feather name="trending-up" size={13} color="#16a34a" />
                    <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>الإيرادات</Text>
                  </View>
                  <Text style={[styles.metricValue, { color: "#16a34a" }]}>
                    {Number(b.revenue).toLocaleString("ar", { maximumFractionDigits: 0 })}
                  </Text>
                </View>
                <View style={[styles.metricBox, { backgroundColor: colors.card, borderWidth: 1, borderColor: "#ef444422", flex: 1 }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <Feather name="trending-down" size={13} color="#ef4444" />
                    <Text style={[styles.metricLabel, { color: "#ef4444" }]}>المصاريف</Text>
                  </View>
                  <Text style={[styles.metricValue, { color: "#ef4444" }]}>
                    {Number(b.expenses).toLocaleString("ar", { maximumFractionDigits: 0 })}
                  </Text>
                </View>
              </View>

              {/* My share (shared trips) */}
              {trip.isShared && (
                <View style={[styles.myShareBox, { borderColor: "#c4b5fd", backgroundColor: "#f5f3ff" }]}>
                  <Text style={styles.myShareLabel}>نصيبك (بعد القسمة)</Text>
                  <Text style={[styles.myShareValue, { color: b.myShare >= 0 ? "#7c3aed" : "#ef4444" }]}>
                    {b.myShare >= 0 ? "+" : ""}{Number(b.myShare).toLocaleString("ar", { maximumFractionDigits: 0 })} {b.currency}
                  </Text>
                </View>
              )}
            </View>
          ))
        )}
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
  tripName: { fontSize: 18, fontWeight: "700" as const, fontFamily: "Inter_700Bold", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right" },
  sharedBadge: { backgroundColor: "#ede9fe", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  sharedText: { fontSize: 11, color: "#7c3aed", fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  routeText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  sharedNotice: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1,
  },
  sharedNoticeText: { fontSize: 13, color: "#7c3aed", fontFamily: "Inter_400Regular", flex: 1, textAlign: "right" },
  emptyBox: {
    borderWidth: 1, borderRadius: 14, padding: 40, alignItems: "center",
    gap: 8, borderStyle: "dashed",
  },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  pnlCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  netLabel: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "right" },
  netValue: { fontSize: 22, fontWeight: "700" as const, fontFamily: "Inter_700Bold", textAlign: "right" },
  currencyTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  currencyTagText: { fontSize: 12, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  metricBox: { borderRadius: 12, padding: 12 },
  metricLabel: { fontSize: 11, color: "#16a34a", fontWeight: "500" as const, fontFamily: "Inter_500Medium" },
  metricValue: { fontSize: 16, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  myShareBox: { borderRadius: 12, padding: 12, borderWidth: 1, marginTop: 10 },
  myShareLabel: { fontSize: 11, color: "#7c3aed", fontWeight: "500" as const, fontFamily: "Inter_500Medium", textAlign: "right" },
  myShareValue: { fontSize: 18, fontWeight: "700" as const, fontFamily: "Inter_700Bold", textAlign: "right" },
});
