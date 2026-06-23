import {
  useListStudios,
  useCreateStudio,
  useDeleteStudio,
} from "@workspace/api-client-react";
import type { StudioInput } from "@workspace/api-client-react";
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

export default function StudiosScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useSettings();
  const t = useTr(settings.language);
  const isAr = settings.language === "ar";

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");

  const { data: studios, isLoading, refetch } = useListStudios();
  const { mutateAsync: createStudio, isPending: creating } = useCreateStudio();
  const { mutateAsync: deleteStudio } = useDeleteStudio();

  const handleDelete = (id: string) => {
    Alert.alert(
      isAr ? "حذف الاستديو" : "Delete Studio",
      isAr ? "هل تريد حذف هذا الاستديو؟" : "Delete this studio?",
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => {
            await deleteStudio({ id });
            refetch();
          },
        },
      ]
    );
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createStudio({ data: { name: name.trim(), address: address.trim() || undefined } as StudioInput });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
      setName("");
      setAddress("");
      refetch();
    } catch {
      Alert.alert(isAr ? "خطأ" : "Error", isAr ? "فشل إضافة الاستديو" : "Failed to add studio");
    }
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("studios")}</Text>
        <Pressable
          onPress={() => setShowModal(true)}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <Feather name="plus" size={18} color="#fff" />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={studios ?? []}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad + 100, gap: 10 }}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="home" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noStudios")}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                {isAr ? "اضغط + لإضافة استديو جديد" : "Press + to add a new studio"}
              </Text>
            </View>
          }
          renderItem={({ item }: any) => (
            <View style={[styles.studioCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", flex: 1, gap: 12 }}
                onPress={() => router.push(`/studio/${item.id}`)}
              >
                <View style={[styles.studioIcon, { backgroundColor: colors.accent }]}>
                  <Feather name="home" size={22} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.studioName, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>{item.name}</Text>
                  {item.address ? (
                    <Text style={[styles.studioAddress, { color: colors.mutedForeground, textAlign: isAr ? "right" : "left" }]}>{item.address}</Text>
                  ) : null}
                </View>
                <Feather name={isAr ? "chevron-left" : "chevron-right"} size={18} color={colors.mutedForeground} />
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
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("newStudio")}</Text>
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
                placeholder={t("studioNamePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                textAlign={isAr ? "right" : "left"}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "العنوان" : "Address"}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={address}
                onChangeText={setAddress}
                placeholder={t("addressPlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                textAlign={isAr ? "right" : "left"}
              />

              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary }, (!name.trim() || creating) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!name.trim() || creating}
              >
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t("addStudioTitle")}</Text>}
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
  studioCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  studioIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  studioName: { fontSize: 15, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  studioAddress: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
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
  deleteBtn: {
    width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", marginLeft: 6,
  },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
});
