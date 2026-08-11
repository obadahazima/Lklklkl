import {
  useListAccounts,
  useCreateAccount,
  useDeleteAccount,
} from "@workspace/api-client-react";
import type { AccountInput } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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

const TYPE_ICON: Record<string, keyof typeof Feather.glyphMap> = {
  cash: "dollar-sign",
  debit: "credit-card",
  credit: "credit-card",
};

const ACCOUNT_COLORS = [
  "#3B82F6", "#EF4444", "#F59E0B", "#10B981",
  "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
  "#6366F1", "#14B8A6", "#84CC16", "#64748B",
];

export default function AccountsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const t = useTr(settings.language);
  const isAr = settings.language === "ar";

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("cash");
  const [currency, setCurrency] = useState(settings.primaryCurrency || "AED");
  const [initialBalance, setInitialBalance] = useState("0");
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);

  const { data: accounts, isLoading, refetch } = useListAccounts();
  const { mutateAsync: createAccount, isPending: creating } = useCreateAccount();
  const { mutateAsync: deleteAccount } = useDeleteAccount();

  const typeLabel = (ty: string) =>
    ty === "cash" ? (isAr ? "كاش" : "Cash") : ty === "credit" ? (isAr ? "بطاقة ائتمان" : "Credit card") : (isAr ? "بطاقة ديبت" : "Debit card");

  const handleDelete = (id: string) => {
    Alert.alert(
      isAr ? "حذف الحساب" : "Delete Account",
      isAr ? "معاملاته القديمة رح تضل موجودة بس بدون ربط فيه. متأكد؟" : "Past transactions will stay but lose their link to it. Delete this account?",
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => {
            await deleteAccount({ id: parseInt(id, 10) });
            refetch();
          },
        },
      ],
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createAccount({
        data: { name: name.trim(), type, currency, color, initialBalance: parseFloat(initialBalance) || 0 } as AccountInput,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
      setName("");
      setType("cash");
      setColor(ACCOUNT_COLORS[0]);
      setInitialBalance("0");
      refetch();
    } catch {
      Alert.alert(isAr ? "خطأ" : "Error", isAr ? "فشل إضافة الحساب" : "Failed to add account");
    }
  };

  const totalsByCurrency = (accounts ?? []).reduce<Record<string, number>>((acc, a: any) => {
    acc[a.currency] = (acc[a.currency] ?? 0) + a.currentBalance;
    return acc;
  }, {});

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{isAr ? "الحسابات" : "Accounts"}</Text>
        <Pressable
          onPress={() => setShowModal(true)}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={18} color="#fff" />
        </Pressable>
      </View>

      {Object.keys(totalsByCurrency).length > 0 && (
        <View style={[styles.totalsBar, { backgroundColor: colors.primary }]}>
          <Text style={styles.totalsLabel}>{isAr ? "الإجمالي:" : "Total:"}</Text>
          {Object.entries(totalsByCurrency).map(([cur, total]) => (
            <Text key={cur} style={styles.totalsValue}>{total.toFixed(2)} {cur}</Text>
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={accounts ?? []}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad + 100, gap: 10 }}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="credit-card" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {isAr ? "ما في حسابات بعد" : "No accounts yet"}
              </Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                {isAr ? "اضغط + لإضافة حساب جديد" : "Press + to add a new account"}
              </Text>
            </View>
          }
          renderItem={({ item }: any) => (
            <View style={[styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}>
                <View style={[styles.accountIcon, { backgroundColor: `${item.color ?? "#3B82F6"}22` }]}>
                  <Feather name={TYPE_ICON[item.type] ?? "credit-card"} size={20} color={item.color ?? colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.accountName, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>{item.name}</Text>
                  <Text style={[styles.accountType, { color: colors.mutedForeground, textAlign: isAr ? "right" : "left" }]}>{typeLabel(item.type)}</Text>
                </View>
                <Text style={[styles.accountBalance, { color: item.currentBalance >= 0 ? "#16a34a" : "#dc2626" }]}>
                  {item.currentBalance.toFixed(2)} {item.currency}
                </Text>
              </View>
              <Pressable
                onPress={() => handleDelete(String(item.id))}
                hitSlop={8}
                style={[styles.deleteBtn, { backgroundColor: "#fee2e2" }]}
              >
                <Feather name="trash-2" size={15} color="#ef4444" />
              </Pressable>
            </View>
          )}
        />
      )}

      <Modal visible={showModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{isAr ? "حساب جديد" : "New Account"}</Text>
                <Pressable onPress={() => setShowModal(false)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "الاسم *" : "Name *"}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={name}
                onChangeText={setName}
                placeholder={isAr ? "مثلاً: فيزا الشغل" : "e.g. Work Visa"}
                placeholderTextColor={colors.mutedForeground}
                textAlign={isAr ? "right" : "left"}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "النوع" : "Type"}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["cash", "debit", "credit"] as const).map((ty) => (
                  <Pressable
                    key={ty}
                    onPress={() => setType(ty)}
                    style={[
                      styles.typeChip,
                      { borderColor: type === ty ? colors.primary : colors.border, backgroundColor: type === ty ? colors.primary + "15" : "transparent" },
                    ]}
                  >
                    <Text style={{ color: type === ty ? colors.primary : colors.foreground, fontWeight: "600" }}>{typeLabel(ty)}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "العملة" : "Currency"}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={currency}
                onChangeText={(v) => setCurrency(v.toUpperCase())}
                placeholder="AED"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                textAlign={isAr ? "right" : "left"}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "الرصيد الابتدائي (اختياري)" : "Initial balance (optional)"}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={initialBalance}
                onChangeText={setInitialBalance}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                textAlign={isAr ? "right" : "left"}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "لون الحساب" : "Account color"}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                {ACCOUNT_COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      color === c && { borderWidth: 3, borderColor: colors.foreground },
                    ]}
                  />
                ))}
              </View>

              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary }, (!name.trim() || creating) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!name.trim() || creating}
              >
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{isAr ? "إضافة" : "Add"}</Text>}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  addBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  totalsBar: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
  totalsLabel: { color: "#fff", fontSize: 13, opacity: 0.9, fontFamily: "Inter_500Medium" },
  totalsValue: { color: "#fff", fontSize: 13, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  accountIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  accountName: { fontSize: 15, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  accountType: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  accountBalance: { fontSize: 14, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  emptyBox: {
    borderWidth: 1, borderRadius: 14, padding: 40, alignItems: "center", gap: 8,
    borderStyle: "dashed", marginTop: 20,
  },
  emptyText: { fontSize: 15, fontFamily: "Inter_500Medium", textAlign: "center" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContent: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, borderWidth: 1, borderBottomWidth: 0, gap: 8,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontSize: 18, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  fieldLabel: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  input: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  typeChip: {
    flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: "center",
  },
  colorSwatch: {
    width: 32, height: 32, borderRadius: 16,
  },
  deleteBtn: {
    width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginLeft: 6,
  },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
});
