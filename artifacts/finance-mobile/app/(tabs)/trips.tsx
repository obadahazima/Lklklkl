import {
  useListTrips,
  useCreateTrip,
} from "@workspace/api-client-react";
import type { TripInput } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/contexts/SettingsContext";
import { useTr } from "@/lib/i18n";

function formatDate(d: string, lang: "ar" | "en") {
  try {
    return new Date(d).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function statusLabel(s: string, lang: "ar" | "en") {
  if (lang === "en") {
    if (s === "active") return "Active";
    if (s === "completed") return "Completed";
    if (s === "cancelled") return "Cancelled";
    return s;
  }
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

function statusBg(s: string) {
  if (s === "active") return "#dbeafe";
  if (s === "completed") return "#dcfce7";
  if (s === "cancelled") return "#fee2e2";
  return "#f4f6f9";
}

export default function TripsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const router = useRouter();
  const { settings } = useSettings();
  const t = useTr(settings.language);
  const isAr = settings.language === "ar";

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    origin: "",
    destination: "",
    departureDate: new Date().toISOString().slice(0, 10),
    notes: "",
    isShared: false,
  });

  const { data: trips, isLoading, refetch } = useListTrips();
  const { mutateAsync: createTrip, isPending: creating } = useCreateTrip();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      await createTrip({
        data: {
          name: form.name.trim(),
          origin: form.origin.trim() || undefined,
          destination: form.destination.trim() || undefined,
          departureDate: form.departureDate || undefined,
          notes: form.notes.trim() || undefined,
          isShared: form.isShared,
        } as TripInput,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
      setForm({ name: "", origin: "", destination: "", departureDate: new Date().toISOString().slice(0, 10), notes: "", isShared: false });
      refetch();
    } catch {
      Alert.alert(isAr ? "خطأ" : "Error", isAr ? "فشل إضافة الرحلة" : "Failed to add trip");
    }
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("trips")}</Text>
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
          data={trips ?? []}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomPad + 100, gap: 10 }}
          scrollEnabled={!!(trips && trips.length > 0)}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="package" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noTrips")}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>
                {isAr ? "اضغط + لإضافة رحلة جديدة" : "Press + to add a new trip"}
              </Text>
            </View>
          }
          renderItem={({ item }: any) => (
            <Pressable
              style={[styles.tripCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/trip/${item.id}`)}
            >
              <View style={styles.tripTopRow}>
                <View style={[styles.statusBadge, { backgroundColor: statusBg(item.status) }]}>
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>{statusLabel(item.status, settings.language)}</Text>
                </View>
                {item.isShared && (
                  <View style={styles.sharedBadge}>
                    <Text style={styles.sharedBadgeText}>{t("shared")}</Text>
                  </View>
                )}
                <Text style={[styles.tripName, { color: colors.foreground }]}>{item.name}</Text>
              </View>

              {(item.origin || item.destination) && (
                <View style={styles.routeRow}>
                  {item.origin && (
                    <Text style={[styles.routeText, { color: colors.mutedForeground }]}>{item.origin}</Text>
                  )}
                  {item.origin && item.destination && (
                    <Feather name={isAr ? "arrow-left" : "arrow-right"} size={12} color={colors.mutedForeground} />
                  )}
                  {item.destination && (
                    <Text style={[styles.routeText, { color: colors.mutedForeground }]}>{item.destination}</Text>
                  )}
                </View>
              )}

              {item.departureDate && (
                <Text style={[styles.tripDate, { color: colors.mutedForeground }]}>
                  {formatDate(item.departureDate, settings.language)}
                </Text>
              )}

              {item.notes && (
                <Text style={[styles.tripNotes, { color: colors.mutedForeground }]} numberOfLines={2}>
                  {item.notes}
                </Text>
              )}
              <View style={{ alignItems: "flex-end", marginTop: 2 }}>
                <Feather name={isAr ? "chevron-left" : "chevron-right"} size={14} color={colors.mutedForeground} />
              </View>
            </Pressable>
          )}
        />
      )}

      <Modal visible={showModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("newTrip")}</Text>
                <Pressable onPress={() => setShowModal(false)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "اسم الرحلة *" : "Trip name *"}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                placeholder={t("tripNamePlaceholder")}
                placeholderTextColor={colors.mutedForeground}
                textAlign={isAr ? "right" : "left"}
              />

              <View style={styles.rowFields}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                    {isAr ? "من" : "From"}
                  </Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={form.origin}
                    onChangeText={(v) => setForm((f) => ({ ...f, origin: v }))}
                    placeholder={isAr ? "دبي" : "Dubai"}
                    placeholderTextColor={colors.mutedForeground}
                    textAlign={isAr ? "right" : "left"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                    {isAr ? "إلى" : "To"}
                  </Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={form.destination}
                    onChangeText={(v) => setForm((f) => ({ ...f, destination: v }))}
                    placeholder={isAr ? "حلب" : "Aleppo"}
                    placeholderTextColor={colors.mutedForeground}
                    textAlign={isAr ? "right" : "left"}
                  />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "تاريخ المغادرة" : "Departure Date"}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={form.departureDate}
                onChangeText={(v) => setForm((f) => ({ ...f, departureDate: v }))}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.mutedForeground}
                textAlign="left"
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground, textAlign: isAr ? "right" : "left" }]}>
                {isAr ? "ملاحظات" : "Notes"}
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={form.notes}
                onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                placeholder={isAr ? "أي تفاصيل إضافية..." : "Any extra details..."}
                placeholderTextColor={colors.mutedForeground}
                textAlign={isAr ? "right" : "left"}
                multiline
                numberOfLines={2}
              />

              <Pressable
                style={styles.sharedRow}
                onPress={() => setForm((f) => ({ ...f, isShared: !f.isShared }))}
              >
                <Switch
                  value={form.isShared}
                  onValueChange={(v) => setForm((f) => ({ ...f, isShared: v }))}
                  trackColor={{ true: colors.primary }}
                />
                <Text style={[styles.sharedLabel, { color: colors.foreground }]}>{t("sharedTripLabel")}</Text>
              </Pressable>

              <Pressable
                style={[styles.saveBtn, { backgroundColor: colors.primary }, (!form.name.trim() || creating) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={!form.name.trim() || creating}
              >
                {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t("addTripTitle")}</Text>}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  tripCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  tripTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  tripName: {
    fontSize: 16,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  routeText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  tripDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
  },
  tripNotes: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 18,
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
  emptyHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
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
    textAlign: "right",
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
  rowFields: {
    flexDirection: "row",
    gap: 10,
  },
  sharedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 8,
  },
  sharedLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  sharedBadge: {
    backgroundColor: "#ede9fe",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  sharedBadgeText: {
    fontSize: 11,
    color: "#7c3aed",
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
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
