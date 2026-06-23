import {
  useListClients,
  useCreateClient,
  useDeleteClient,
} from "@workspace/api-client-react";
import type { ClientInput } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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

export default function ClientsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useSettings();
  const t = useTr(settings.language);
  const isAr = settings.language === "ar";

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");

  const { data: clients, isLoading, refetch } = useListClients();
  const { mutateAsync: createClient, isPending: creating } = useCreateClient();
  const { mutateAsync: deleteClient } = useDeleteClient();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const filtered = (clients ?? []).filter((c: any) =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createClient({ data: { name: name.trim(), phone: phone.trim() || undefined } as ClientInput });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
      setName("");
      setPhone("");
      refetch();
    } catch {
      Alert.alert(isAr ? "خطأ" : "Error", isAr ? "فشل إضافة الزبون" : "Failed to add client");
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      isAr ? "حذف الزبون" : "Delete Client",
      t("deleteClientConfirm"),
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => {
            await deleteClient({ id });
            refetch();
          },
        },
      ]
    );
  };

  function initials(name: string) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase();
  }

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("clients")}</Text>
        <Pressable
          onPress={() => setShowModal(true)}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="user-plus" size={18} color="#fff" />
        </Pressable>
      </View>

      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          value={search}
          onChangeText={setSearch}
          placeholder={isAr ? "بحث بالاسم أو رقم الهاتف..." : "Search by name or phone..."}
          placeholderTextColor={colors.mutedForeground}
          textAlign={isAr ? "right" : "left"}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad + 100, gap: 8 }}
          scrollEnabled={!!(filtered.length > 0)}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="users" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? (isAr ? "لا توجد نتائج" : "No results") : t("noClients")}
              </Text>
            </View>
          }
          renderItem={({ item }: any) => (
            <View style={[styles.clientCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}
                onPress={() => router.push(`/client/${item.id}`)}
              >
                <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>{initials(item.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.clientName, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>{item.name}</Text>
                  {item.phone ? (
                    <Text style={[styles.clientPhone, { color: colors.mutedForeground, textAlign: isAr ? "right" : "left" }]}>{item.phone}</Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  {item.balance != null && (
                    <Text style={[
                      styles.clientBalance,
                      { color: parseFloat(item.balance) >= 0 ? (colors.success ?? "#16a34a") : colors.destructive }
                    ]}>
                      {parseFloat(item.balance).toLocaleString(isAr ? "ar" : "en", { maximumFractionDigits: 0 })}
                    </Text>
                  )}
                  <Feather name={isAr ? "chevron-left" : "chevron-right"} size={14} color={colors.mutedForeground} />
                </View>
              </Pressable>
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
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("newClient")}</Text>
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
                placeholder={t("clientNamePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                textAlign={isAr ? "right" : "left"}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "رقم الهاتف" : "Phone"}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={phone}
                onChangeText={setPhone}
                placeholder={t("phonePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                textAlign="left"
              />

              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary }, (!name.trim() || creating) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!name.trim() || creating}
              >
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t("addClientTitle")}</Text>}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  clientCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 15,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
  },
  clientName: {
    fontSize: 15,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  clientPhone: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  clientBalance: {
    fontSize: 14,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  emptyBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 40,
    alignItems: "center",
    gap: 8,
    borderStyle: "dashed",
    marginTop: 20,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    gap: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
});
