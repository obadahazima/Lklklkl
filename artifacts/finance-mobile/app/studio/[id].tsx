import {
  useGetStudio,
  useListStudioExpenses,
  useCreateStudioExpense,
  useDeleteStudioExpense,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/contexts/SettingsContext";
import { useTr } from "@/lib/i18n";
import { exportStatementPdf } from "@/lib/export";

const CURRENCIES_FALLBACK = ["AED", "USD", "SYP"] as const;
const CATEGORIES = [
  { value: "rent", label: "إيجار" },
  { value: "electricity", label: "كهرباء" },
  { value: "internet", label: "إنترنت" },
  { value: "maintenance", label: "صيانة" },
  { value: "other", label: "أخرى" },
];

function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString("ar", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}

function categoryLabel(v: string) {
  return CATEGORIES.find((c) => c.value === v)?.label ?? v;
}

export default function StudioDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useSettings();
  const t = useTr(settings.language);
  const { id } = useLocalSearchParams<{ id: string }>();
  const studioId = parseInt(id);
  const qc = useQueryClient();

  const [showModal, setShowModal] = useState(false);
  const activeCurrencies = settings.currencies.length > 0 ? settings.currencies : [...CURRENCIES_FALLBACK];
  const [form, setForm] = useState({
    category: "rent",
    amount: "",
    currency: activeCurrencies[0] as string,
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const { data: studio } = useGetStudio(studioId, { query: { enabled: !!studioId } });
  const { data: expenses, isLoading, refetch } = useListStudioExpenses(studioId, { query: { enabled: !!studioId } });
  const { mutateAsync: createExpense, isPending: creating } = useCreateStudioExpense();
  const { mutateAsync: deleteExpense } = useDeleteStudioExpense();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const totals = (expenses ?? []).reduce((acc: Record<string, number>, e: any) => {
    acc[e.currency] = (acc[e.currency] || 0) + Number(e.amount);
    return acc;
  }, {});

  const rates = settings.manualRates;
  const toPrimary = (amount: number, currency: string) => {
    const inAed = currency === "AED" ? amount : amount * (rates[currency] ?? 1);
    return settings.primaryCurrency === "AED" ? inAed : inAed / (rates[settings.primaryCurrency] ?? 1);
  };

  const handleShare = async () => {
    try {
      const primaryTotal =
        Math.round(
          Object.entries(totals).reduce((sum, [cur, amt]) => sum + toPrimary(amt as number, cur), 0) * 100,
        ) / 100;
      await exportStatementPdf({
        title: studio?.name || t("studios"),
        subtitle: t("studioExpensesTitle"),
        transactions: (expenses ?? []).map((e: any) => ({
          date: e.date,
          type: "expense",
          description: [categoryLabel(e.category), e.notes].filter(Boolean).join(" — "),
          amount: Number(e.amount),
          currency: e.currency,
        })),
        totals: Object.entries(totals).map(([currency, amt]) => ({
          currency,
          paid: amt as number,
          received: 0,
          openBalance: -(amt as number),
        })),
        primaryCurrency: settings.primaryCurrency,
        primaryTotal: -primaryTotal,
      });
    } catch {
      Alert.alert(t("share"), t("exportPdf"));
    }
  };

  const handleCreate = async () => {
    if (!form.amount) return;
    try {
      await createExpense({
        id: studioId,
        data: {
          category: form.category,
          amount: parseFloat(form.amount),
          currency: form.currency,
          date: form.date,
          notes: form.notes || undefined,
        } as any,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
      setForm({ category: "rent", amount: "", currency: "AED", date: new Date().toISOString().slice(0, 10), notes: "" });
      refetch();
    } catch {
      Alert.alert("خطأ", "فشل إضافة المصروف");
    }
  };

  const handleDelete = (expenseId: number) => {
    Alert.alert("حذف المصروف", "هل أنت متأكد؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          await deleteExpense({ expenseId });
          refetch();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-right" size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{studio?.name ?? "..."}</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>مصاريف الاستوديو</Text>
        </View>
        <Pressable onPress={handleShare} style={[styles.shareBtn, { backgroundColor: colors.accent }]} accessibilityLabel={t("share")}>
          <Feather name="share-2" size={18} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => setShowModal(true)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
          <Feather name="plus" size={18} color="#fff" />
        </Pressable>
      </View>

      {Object.keys(totals).length > 0 && (
        <View style={styles.totalsRow}>
          {Object.entries(totals).map(([currency, total]) => (
            <View key={currency} style={[styles.totalBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>الإجمالي</Text>
              <Text style={[styles.totalValue, { color: colors.destructive }]}>
                {(total as number).toLocaleString("ar")} {currency}
              </Text>
            </View>
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={expenses ?? []}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad + 100, gap: 8 }}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="file-text" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد مصاريف مسجلة</Text>
            </View>
          }
          renderItem={({ item }: any) => (
            <View style={[styles.expenseCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                  <Text style={[styles.expenseCat, { color: colors.foreground }]}>{categoryLabel(item.category)}</Text>
                  <View style={[styles.currencyTag, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.currencyTagText, { color: colors.primary }]}>{item.currency}</Text>
                  </View>
                </View>
                <Text style={[styles.expenseDate, { color: colors.mutedForeground }]}>{formatDate(item.date)}</Text>
                {item.notes ? <Text style={[styles.expenseNotes, { color: colors.mutedForeground }]}>{item.notes}</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end", gap: 6 }}>
                <Text style={[styles.expenseAmount, { color: colors.destructive }]}>
                  -{Number(item.amount).toLocaleString("ar")}
                </Text>
                <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                  <Feather name="trash-2" size={15} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={showModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>مصروف جديد</Text>
                <Pressable onPress={() => setShowModal(false)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>الفئة</Text>
              <View style={styles.catRow}>
                {CATEGORIES.map((c) => (
                  <Pressable
                    key={c.value}
                    onPress={() => setForm((f) => ({ ...f, category: c.value }))}
                    style={[
                      styles.catBtn, { borderColor: colors.border },
                      form.category === c.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text style={[styles.catText, { color: form.category === c.value ? "#fff" : colors.mutedForeground }]}>
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>المبلغ</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={form.amount}
                onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.mutedForeground}
                textAlign="right"
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>العملة</Text>
              <View style={styles.segRow}>
                {activeCurrencies.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setForm((f) => ({ ...f, currency: c }))}
                    style={[
                      styles.segBtn, { borderColor: colors.border },
                      form.currency === c && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    <Text style={[styles.segText, { color: form.currency === c ? "#fff" : colors.mutedForeground }]}>{c}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>التاريخ</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={form.date}
                onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                textAlign="left"
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>ملاحظات</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={form.notes}
                onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder="اختياري"
                placeholderTextColor={colors.mutedForeground}
                textAlign="right"
              />

              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary }, (!form.amount || creating) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!form.amount || creating}
              >
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>إضافة المصروف</Text>}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700" as const, fontFamily: "Inter_700Bold", textAlign: "right" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right" },
  addBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  shareBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  totalsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
  totalBadge: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, alignItems: "center" },
  totalLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  totalValue: { fontSize: 15, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  expenseCard: {
    flexDirection: "row", alignItems: "center", borderRadius: 12,
    padding: 12, borderWidth: 1, gap: 10,
  },
  expenseCat: { fontSize: 14, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  expenseDate: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 2 },
  expenseNotes: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "right", marginTop: 2 },
  expenseAmount: { fontSize: 15, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  currencyTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  currencyTagText: { fontSize: 10, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  emptyBox: {
    borderWidth: 1, borderRadius: 14, padding: 40, alignItems: "center",
    gap: 8, borderStyle: "dashed", marginTop: 20,
  },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, borderWidth: 1, borderBottomWidth: 0, gap: 8,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold", textAlign: "right", marginTop: 4 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  catText: { fontSize: 12, fontWeight: "500" as const, fontFamily: "Inter_500Medium" },
  segRow: { flexDirection: "row", gap: 8 },
  segBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
    alignItems: "center",
  },
  segText: { fontSize: 13, fontWeight: "500" as const, fontFamily: "Inter_500Medium" },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
});
