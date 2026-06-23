import {
  useListTransactions,
  useCreateTransaction,
  useDeleteTransaction,
  useListClients,
  useListTrips,
  useListStudios,
  useCreateClient,
  useCreateTrip,
  useCreateStudio,
  useParseVoiceInput,
  getListClientsQueryKey,
  getListTripsQueryKey,
  getListStudiosQueryKey,
  getListTransactionsQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import type {
  TransactionInput,
  VoiceParseResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  useSettings,
  AVAILABLE_CURRENCIES,
  getCurrencyName,
} from "@/contexts/SettingsContext";
import { useTr } from "@/lib/i18n";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";

const TX_TYPES = ["income", "expense", "payment", "receipt"] as const;
type TxType = (typeof TX_TYPES)[number];

function isOutgoing(t: string) {
  return t === "expense" || t === "payment";
}

function typeColor(t: string) {
  return isOutgoing(t) ? "#ef4444" : "#16a34a";
}

function typeBg(t: string, isDark?: boolean) {
  if (isOutgoing(t)) return isDark ? "#3f1212" : "#fee2e2";
  return isDark ? "#0f2d1a" : "#dcfce7";
}

function typeIcon(t: string): keyof typeof Feather.glyphMap {
  if (t === "income") return "arrow-down-left";
  if (t === "receipt") return "arrow-down-left";
  return "arrow-up-right";
}

function formatDate(d: string, lang: string) {
  try {
    return new Date(d).toLocaleDateString(lang === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

type ResolutionState =
  | { kind: "idle" }
  | { kind: "similar"; matches: { id: number; name: string }[]; inputName: string }
  | { kind: "new"; name: string };

type FormState = {
  type: TxType;
  amount: string;
  currency: string;
  clientId: string;
  tripId: string;
  studioId: string;
  description: string;
  status: "pending" | "settled";
  date: string;
};

function emptyForm(primaryCurrency = "AED"): FormState {
  return {
    type: "income",
    amount: "",
    currency: primaryCurrency,
    clientId: "",
    tripId: "",
    studioId: "",
    description: "",
    status: "pending",
    date: new Date().toISOString().slice(0, 10),
  };
}

export default function TransactionsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { settings } = useSettings();
  const { language, primaryCurrency, showClients, showTrips, showStudios } = settings;
  const t = useTr(language);
  const voice = useVoiceRecording(language);
  const params = useLocalSearchParams<{ openAdd?: string; openVoice?: string }>();

  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (params.openAdd === "1") {
      setShowModal(true);
    }
  }, [params.openAdd]);

  useEffect(() => {
    if (params.openVoice === "1") {
      openVoiceSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.openVoice]);

  const [form, setForm] = useState<FormState>(() => emptyForm(primaryCurrency));
  const [aiText, setAiText] = useState("");

  const [filterType, setFilterType] = useState<string>("all");
  const [filterCurrency, setFilterCurrency] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [picker, setPicker] = useState<{
    title: string;
    options: { value: string; label: string }[];
    selected: string;
    onSelect: (v: string) => void;
  } | null>(null);

  const [clientResolution, setClientResolution] = useState<ResolutionState>({ kind: "idle" });
  const [tripResolution, setTripResolution] = useState<ResolutionState>({ kind: "idle" });
  const [studioResolution, setStudioResolution] = useState<ResolutionState>({ kind: "idle" });
  const [newClientPhone, setNewClientPhone] = useState("");

  const parsedRef = useRef<VoiceParseResult | null>(null);
  const resolveRef = useRef<{ clientId?: number | null; tripId?: number | null; studioId?: number | null }>({});

  const [voiceSheetVisible, setVoiceSheetVisible] = useState(false);
  const [voiceSheetStep, setVoiceSheetStep] = useState<"recording" | "processing" | "result">("recording");
  const voiceSheetFlowRef = useRef(false);

  const { data: transactions, isLoading, refetch } = useListTransactions({});
  const { data: clients } = useListClients();
  const { data: trips } = useListTrips();
  const { data: studios } = useListStudios();
  const { mutateAsync: createTx, isPending: creating } = useCreateTransaction();
  const { mutateAsync: deleteTx } = useDeleteTransaction();

  const parseMutation = useParseVoiceInput({
    mutation: {
      onSuccess: (data) => {
        if (data.success) {
          applyParsed(data);
        } else {
          if (voiceSheetFlowRef.current) setVoiceSheetStep("recording");
          Alert.alert(t("notUnderstood"), data.error || t("tryAgain"));
        }
      },
      onError: () => {
        if (voiceSheetFlowRef.current) setVoiceSheetStep("recording");
        Alert.alert(t("saveError"), t("tryAgain"));
      },
    },
  });

  const createClientMutation = useCreateClient({
    mutation: {
      onSuccess: (newClient) => {
        qc.invalidateQueries({ queryKey: getListClientsQueryKey() });
        resolveRef.current.clientId = newClient.id;
        setClientResolution({ kind: "idle" });
        setNewClientPhone("");
        advanceResolutionChain();
      },
    },
  });

  const createTripMutation = useCreateTrip({
    mutation: {
      onSuccess: (newTrip) => {
        qc.invalidateQueries({ queryKey: getListTripsQueryKey() });
        resolveRef.current.tripId = newTrip.id;
        setTripResolution({ kind: "idle" });
        advanceResolutionChain();
      },
    },
  });

  const createStudioMutation = useCreateStudio({
    mutation: {
      onSuccess: (newStudio) => {
        qc.invalidateQueries({ queryKey: getListStudiosQueryKey() });
        resolveRef.current.studioId = newStudio.id;
        setStudioResolution({ kind: "idle" });
        advanceResolutionChain();
      },
    },
  });

  const resolving =
    createClientMutation.isPending || createTripMutation.isPending || createStudioMutation.isPending;

  function findSimilar(list: { id: number; name: string }[] | undefined, name: string) {
    if (!list || !name) return [];
    const n = norm(name);
    return list
      .filter((c) => {
        const cn = norm(c.name);
        return cn === n || cn.includes(n) || n.includes(cn) || n.split(" ").some((w) => w.length > 1 && cn.includes(w));
      })
      .map((c) => ({ id: c.id, name: c.name }));
  }

  function applyParsed(data: VoiceParseResult) {
    const nextType = TX_TYPES.includes(data.type as TxType) ? (data.type as TxType) : undefined;
    setForm((f) => ({
      ...f,
      type: nextType ?? f.type,
      amount: data.amount != null ? String(data.amount) : f.amount,
      currency: data.currency || f.currency,
      description: data.description ?? f.description,
    }));
    parsedRef.current = data;
    resolveRef.current = {};
    advanceResolutionChain();
  }

  function finishResolution() {
    const r = resolveRef.current;
    setForm((f) => ({
      ...f,
      clientId: r.clientId != null ? String(r.clientId) : "",
      tripId: r.tripId != null ? String(r.tripId) : "",
      studioId: r.studioId != null ? String(r.studioId) : "",
    }));
    parsedRef.current = null;
    if (voiceSheetFlowRef.current) {
      setVoiceSheetStep("result");
    }
  }

  function advanceResolutionChain() {
    const p = parsedRef.current;
    if (!p) return;
    const r = resolveRef.current;

    if (!showClients && r.clientId === undefined) r.clientId = null;
    if (!showTrips && r.tripId === undefined) r.tripId = null;
    if (!showStudios && r.studioId === undefined) r.studioId = null;

    if (r.clientId === undefined) {
      const name = p.clientName?.trim();
      const aiId = p.clientId;
      if (aiId != null) {
        r.clientId = aiId;
      } else if (!name) {
        r.clientId = null;
      } else {
        const exact = clients?.find((c) => norm(c.name) === norm(name));
        if (exact) {
          r.clientId = exact.id;
        } else {
          const similar = findSimilar(clients, name);
          if (similar.length > 0) {
            setClientResolution({ kind: "similar", matches: similar, inputName: name });
            return;
          }
          setClientResolution({ kind: "new", name });
          return;
        }
      }
    }

    if (r.tripId === undefined) {
      const name = p.tripName?.trim();
      const aiId = p.tripId;
      if (aiId != null) {
        r.tripId = aiId;
      } else if (!name) {
        r.tripId = null;
      } else {
        const exact = trips?.find((tp) => norm(tp.name) === norm(name));
        if (exact) {
          r.tripId = exact.id;
        } else {
          const similar = findSimilar(trips, name);
          if (similar.length > 0) {
            setTripResolution({ kind: "similar", matches: similar, inputName: name });
            return;
          }
          setTripResolution({ kind: "new", name });
          return;
        }
      }
    }

    if (r.studioId === undefined) {
      const name = p.studioName?.trim();
      const aiId = p.studioId;
      if (aiId != null) {
        r.studioId = aiId;
      } else if (!name) {
        r.studioId = null;
      } else {
        const exact = studios?.find((s) => norm(s.name) === norm(name));
        if (exact) {
          r.studioId = exact.id;
        } else {
          const similar = findSimilar(studios, name);
          if (similar.length > 0) {
            setStudioResolution({ kind: "similar", matches: similar, inputName: name });
            return;
          }
          setStudioResolution({ kind: "new", name });
          return;
        }
      }
    }

    finishResolution();
  }

  function handleParseText() {
    const text = aiText.trim();
    if (!text) return;
    parseMutation.mutate({ data: { text, currencies: settings.currencies, primaryCurrency: settings.primaryCurrency } });
  }

  async function handleMic() {
    if (voice.state === "recording") {
      const text = await voice.stopAndTranscribe();
      if (text) {
        setAiText(text);
        parseMutation.mutate({ data: { text, currencies: settings.currencies, primaryCurrency: settings.primaryCurrency } });
      } else if (voice.error === "permission_denied") {
        Alert.alert(t("micPermissionDenied"));
      } else if (voice.error) {
        Alert.alert(t("voiceError"));
      }
    } else if (voice.state === "idle") {
      const ok = await voice.startRecording();
      if (!ok) Alert.alert(t("micPermissionDenied"));
    }
  }

  async function openVoiceSheet() {
    resetForm();
    voiceSheetFlowRef.current = true;
    const ok = await voice.startRecording();
    if (!ok) {
      Alert.alert(t("micPermissionDenied"));
      voiceSheetFlowRef.current = false;
    }
  }

  async function handleVoiceSheetStop() {
    if (voice.state !== "recording") return;
    setVoiceSheetStep("processing");
    setVoiceSheetVisible(true);
    const text = await voice.stopAndTranscribe();
    if (text) {
      setAiText(text);
      parseMutation.mutate({ data: { text, currencies: settings.currencies, primaryCurrency: settings.primaryCurrency } });
    } else {
      setVoiceSheetVisible(false);
      voiceSheetFlowRef.current = false;
      if (voice.error === "permission_denied") {
        Alert.alert(t("micPermissionDenied"));
      } else {
        Alert.alert(t("voiceError"), t("tryAgain"));
      }
    }
  }

  function closeVoiceSheet() {
    voiceSheetFlowRef.current = false;
    setVoiceSheetVisible(false);
    resetForm();
    if (voice.state === "recording") {
      voice.cancelRecording();
    }
  }

  async function handleVoiceConfirmSave() {
    if (!form.amount) return;
    voiceSheetFlowRef.current = false;
    setVoiceSheetVisible(false);
    await handleCreate();
  }

  const filtered = (transactions ?? []).filter((tx: any) => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (filterCurrency !== "all" && tx.currency !== filterCurrency) return false;
    if (filterStatus !== "all" && tx.status !== filterStatus) return false;
    return true;
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const resetForm = () => {
    setForm(emptyForm(primaryCurrency));
    setAiText("");
    parsedRef.current = null;
    resolveRef.current = {};
  };

  const handleCreate = async () => {
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      Alert.alert(language === "ar" ? "مبلغ غير صحيح" : "Invalid amount", language === "ar" ? "الرجاء إدخال مبلغ أكبر من الصفر" : "Please enter an amount greater than zero");
      return;
    }
    try {
      const payload: TransactionInput = {
        type: form.type,
        amount: amt,
        currency: form.currency,
        clientId: form.clientId ? parseInt(form.clientId, 10) : null,
        tripId: form.tripId ? parseInt(form.tripId, 10) : null,
        studioId: form.studioId ? parseInt(form.studioId, 10) : null,
        description: form.description || null,
        status: form.status,
        date: form.date,
      };
      await createTx({ data: payload });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
      resetForm();
      qc.invalidateQueries({ queryKey: getListTransactionsQueryKey({}) });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      refetch();
    } catch {
      Alert.alert(t("saveError"), t("saveErrorDesc"));
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(t("delete"), t("deleteTransactionConfirm"), [
      { text: t("cancel"), style: "cancel" },
      {
        text: t("delete"),
        style: "destructive",
        onPress: async () => {
          await deleteTx({ id: parseInt(id, 10) });
          refetch();
        },
      },
    ]);
  };

  const openCurrencyPicker = () =>
    setPicker({
      title: t("currencyLabel"),
      selected: form.currency,
      options: settings.currencies.map((code) => ({
        value: code,
        label: `${getCurrencyName(code, language)} (${code})`,
      })),
      onSelect: (v) => setForm((f) => ({ ...f, currency: v })),
    });

  const openClientPicker = () =>
    setPicker({
      title: t("clientLabel"),
      selected: form.clientId,
      options: [
        { value: "", label: t("noClient") },
        ...(clients ?? []).map((c) => ({ value: String(c.id), label: c.name })),
      ],
      onSelect: (v) => setForm((f) => ({ ...f, clientId: v })),
    });

  const openTripPicker = () =>
    setPicker({
      title: t("tripLabel"),
      selected: form.tripId,
      options: [
        { value: "", label: t("noTripOption") },
        ...(trips ?? []).map((tp) => ({ value: String(tp.id), label: tp.name })),
      ],
      onSelect: (v) => setForm((f) => ({ ...f, tripId: v })),
    });

  const openStudioPicker = () =>
    setPicker({
      title: t("studioLabel"),
      selected: form.studioId,
      options: [
        { value: "", label: t("noStudioOption") },
        ...(studios ?? []).map((s) => ({ value: String(s.id), label: s.name })),
      ],
      onSelect: (v) => setForm((f) => ({ ...f, studioId: v })),
    });

  const clientName = clients?.find((c) => String(c.id) === form.clientId)?.name;
  const tripName = trips?.find((tp) => String(tp.id) === form.tripId)?.name;
  const studioName = studios?.find((s) => String(s.id) === form.studioId)?.name;

  const renderResolution = (
    state: ResolutionState,
    cfg: {
      icon: keyof typeof Feather.glyphMap;
      similarTitle: string;
      similarDesc: string;
      newLabel: string;
      skipText: string;
      newTitle: string;
      showPhone?: boolean;
      onChoose: (id: number) => void;
      onSwitchToNew: () => void;
      onConfirmNew: () => void;
      onSkip: () => void;
    },
  ) => {
    if (state.kind === "idle") return null;
    return (
      <Modal visible transparent animationType="fade" presentationStyle="overFullScreen">
        <View style={styles.resolveOverlay}>
          <View style={[styles.resolveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {state.kind === "similar" ? (
              <>
                <View style={styles.resolveHeader}>
                  <Feather name={cfg.icon} size={20} color="#f59e0b" />
                  <Text style={[styles.resolveTitle, { color: colors.foreground }]}>{cfg.similarTitle}</Text>
                </View>
                <Text style={[styles.resolveDesc, { color: colors.mutedForeground }]}>{cfg.similarDesc}</Text>
                <View style={{ gap: 8, marginBottom: 12 }}>
                  {state.matches.map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => cfg.onChoose(m.id)}
                      disabled={resolving}
                      style={[styles.matchRow, { borderColor: colors.border }]}
                    >
                      <View style={[styles.matchAvatar, { backgroundColor: colors.primary + "22" }]}>
                        <Text style={{ color: colors.primary, fontWeight: "700" }}>{m.name.charAt(0)}</Text>
                      </View>
                      <Text style={[styles.matchName, { color: colors.foreground }]}>{m.name}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={cfg.onSwitchToNew}
                  style={[styles.outlineBtn, { borderColor: colors.primary }]}
                >
                  <Feather name="plus-circle" size={16} color={colors.primary} />
                  <Text style={[styles.outlineBtnText, { color: colors.primary }]}>{cfg.newLabel}</Text>
                </Pressable>
                <Pressable onPress={cfg.onSkip} disabled={resolving} style={styles.skipBtn}>
                  <Text style={[styles.skipText, { color: colors.mutedForeground }]}>{cfg.skipText}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={styles.resolveHeader}>
                  <Feather name={cfg.icon} size={20} color={colors.primary} />
                  <Text style={[styles.resolveTitle, { color: colors.foreground }]}>{cfg.newTitle}</Text>
                </View>
                <Text style={[styles.resolveDesc, { color: colors.mutedForeground }]}>
                  {language === "ar" ? "الاسم" : "Name"}
                </Text>
                <View style={[styles.nameBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={{ color: colors.foreground, fontWeight: "600" }}>{state.name}</Text>
                </View>
                {cfg.showPhone && (
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                    value={newClientPhone}
                    onChangeText={setNewClientPhone}
                    placeholder={`${t("phoneOptional")} ${t("phoneOptionalHint")}`}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="phone-pad"
                    textAlign="right"
                  />
                )}
                <View style={styles.resolveActions}>
                  <Pressable
                    onPress={cfg.onSkip}
                    disabled={resolving}
                    style={[styles.halfBtn, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.skipText, { color: colors.mutedForeground }]}>{t("ignore")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={cfg.onConfirmNew}
                    disabled={resolving}
                    style={[styles.halfBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  >
                    {resolving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={[styles.halfBtnText, { color: "#fff" }]}>{t("addAndSave")}</Text>
                    )}
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("transactions")}</Text>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {voice.state === "recording" && (
            <View style={styles.recTimerBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recTimerText}>
                {`${Math.floor(voice.duration / 60)}:${String(voice.duration % 60).padStart(2, "0")}`}
              </Text>
            </View>
          )}
          <Pressable
            onPress={voice.state === "recording" ? handleVoiceSheetStop : openVoiceSheet}
            style={[
              styles.addBtn,
              { backgroundColor: "#ef4444" },
              voice.state === "recording" && { transform: [{ scale: 1.1 }] },
            ]}
          >
            <Feather name={voice.state === "recording" ? "square" : "mic"} size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={() => setShowModal(true)} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <Feather name="plus" size={18} color="#fff" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {["all", ...TX_TYPES].map((ty) => (
            <Pressable
              key={ty}
              style={[styles.filterChip, filterType === ty && { backgroundColor: colors.primary }]}
              onPress={() => setFilterType(ty)}
            >
              <Text style={[styles.filterChipText, { color: filterType === ty ? "#fff" : colors.mutedForeground }]}>
                {ty === "all"
                  ? t("allTypes")
                  : ty === "income"
                  ? t("typeIncome")
                  : ty === "expense"
                  ? t("typeExpense")
                  : ty === "payment"
                  ? t("typePayment")
                  : t("typeReceipt")}
              </Text>
            </Pressable>
          ))}
          <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />
          {["all", "pending", "settled"].map((st) => (
            <Pressable
              key={st}
              style={[styles.filterChip, filterStatus === st && { backgroundColor: colors.primary }]}
              onPress={() => setFilterStatus(st)}
            >
              <Text style={[styles.filterChipText, { color: filterStatus === st ? "#fff" : colors.mutedForeground }]}>
                {st === "all" ? t("allStatuses") : st === "pending" ? t("statusPending") : t("statusSettled")}
              </Text>
            </Pressable>
          ))}
          <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />
          {["all", ...settings.currencies].map((c) => (
            <Pressable
              key={c}
              style={[styles.filterChip, filterCurrency === c && { backgroundColor: colors.primary }]}
              onPress={() => setFilterCurrency(c)}
            >
              <Text style={[styles.filterChipText, { color: filterCurrency === c ? "#fff" : colors.mutedForeground }]}>
                {c === "all" ? t("allCurrencies") : c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
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
          scrollEnabled={!!(filtered && filtered.length > 0)}
          ListEmptyComponent={
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="inbox" size={32} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{t("noTransactionsFound")}</Text>
              <Text style={[styles.emptyHint, { color: colors.mutedForeground }]}>{t("addNewTransaction")}</Text>
            </View>
          }
          renderItem={({ item }: any) => (
            <Pressable
              style={[styles.txCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onLongPress={() => handleDelete(String(item.id))}
            >
              <View style={[styles.txIcon, { backgroundColor: typeBg(item.type, settings.theme === "dark") }]}>
                <Feather name={typeIcon(item.type)} size={16} color={typeColor(item.type)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.txNote, { color: colors.foreground }]} numberOfLines={1}>
                  {item.description || t(("type" + item.type.charAt(0).toUpperCase() + item.type.slice(1)) as any)}
                </Text>
                <Text style={[styles.txDate, { color: colors.mutedForeground }]}>
                  {formatDate(item.date, language)}
                  {item.status === "pending" ? ` · ${t("statusPending")}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.txAmount, { color: typeColor(item.type) }]}>
                  {isOutgoing(item.type) ? "-" : "+"}
                  {parseFloat(item.amount).toLocaleString()}
                </Text>
                <Text style={[styles.txCurrency, { color: colors.mutedForeground }]}>{item.currency}</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {/* Live Recording Overlay */}
      {voice.state === "recording" && (
        <View style={styles.recOverlay} pointerEvents="box-none">
          <View style={[styles.recCard, { backgroundColor: colors.card, borderColor: "#ef4444" }]}>
            <View style={styles.recCardHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={styles.recDotLarge} />
                <Text style={[styles.recCardTitle, { color: "#ef4444" }]}>
                  {language === "ar" ? "جاري التسجيل" : "Recording"}
                </Text>
              </View>
              <Text style={[styles.recCardTimer, { color: "#ef4444" }]}>
                {`${Math.floor(voice.duration / 60)}:${String(voice.duration % 60).padStart(2, "0")}`}
              </Text>
            </View>

            <View style={[styles.recLiveTextBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {voice.liveText ? (
                <Text style={[styles.recLiveText, { color: colors.foreground }]}>{voice.liveText}</Text>
              ) : (
                <Text style={[styles.recLivePlaceholder, { color: colors.mutedForeground }]}>
                  {language === "ar"
                    ? "💡 «قبضت ٥٠٠ دولار من رشا رحلة دبي»"
                    : '💡 "Received 500 USD from Rasha, Dubai trip"'}
                </Text>
              )}
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => {
                  voiceSheetFlowRef.current = false;
                  voice.cancelRecording();
                }}
                style={[styles.recCancelBtn, { borderColor: colors.border }]}
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
                <Text style={[{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.mutedForeground }]}>
                  {language === "ar" ? "إلغاء" : "Cancel"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleVoiceSheetStop}
                style={[styles.recStopBtn, { backgroundColor: "#ef4444", flex: 1 }]}
              >
                <Feather name="square" size={16} color="#fff" />
                <Text style={[{ fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const, color: "#fff" }]}>
                  {language === "ar" ? "إيقاف وتحليل" : "Stop & Analyze"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Voice Sheet */}
      <Modal visible={voiceSheetVisible} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={[styles.voiceSheetContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {language === "ar" ? "تسجيل معاملة صوتية" : "Voice Transaction"}
                </Text>
                <Pressable onPress={closeVoiceSheet}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </Pressable>
              </View>

              {voiceSheetStep === "processing" && (
                <View style={styles.voiceCenterView}>
                  <ActivityIndicator size="large" color={colors.primary} style={{ marginBottom: 16 }} />
                  <Text style={[styles.voiceStatusText, { color: colors.primary }]}>
                    {voice.state === "transcribing"
                      ? language === "ar" ? "جاري تحويل الصوت..." : "Transcribing..."
                      : language === "ar" ? "جاري التحليل بالذكاء الاصطناعي..." : "Analyzing with AI..."}
                  </Text>
                  {!!aiText && (
                    <View style={[styles.transcribedBox, { backgroundColor: colors.background, borderColor: colors.border, marginTop: 16 }]}>
                      <Text style={[{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4, textAlign: "right" }]}>
                        {language === "ar" ? "النص المسموع" : "Heard"}
                      </Text>
                      <Text style={[{ color: colors.foreground, textAlign: "right", fontSize: 14, lineHeight: 22 }]}>{aiText}</Text>
                    </View>
                  )}
                </View>
              )}

              {voiceSheetStep === "result" && (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
                  {!!aiText && (
                    <View style={[styles.transcribedBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[{ color: colors.mutedForeground, fontSize: 11, marginBottom: 4, textAlign: "right" }]}>
                        {language === "ar" ? "✅ تم التحليل من:" : "✅ Analyzed from:"}
                      </Text>
                      <Text style={[{ color: colors.foreground, textAlign: "right", fontSize: 13, lineHeight: 20 }]}>{aiText}</Text>
                    </View>
                  )}

                  <View style={styles.resultGrid}>
                    <View style={[styles.resultCard, { backgroundColor: typeBg(form.type, settings.theme === "dark"), borderColor: colors.border }]}>
                      <Text style={[styles.resultCardLabel, { color: colors.mutedForeground }]}>
                        {language === "ar" ? "النوع" : "Type"}
                      </Text>
                      <Text style={[styles.resultCardValue, { color: typeColor(form.type) }]}>
                        {form.type === "income" ? t("typeIncome")
                          : form.type === "expense" ? t("typeExpense")
                          : form.type === "payment" ? t("typePayment")
                          : t("typeReceipt")}
                      </Text>
                    </View>
                    <View style={[styles.resultCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[styles.resultCardLabel, { color: colors.mutedForeground }]}>
                        {language === "ar" ? "المبلغ" : "Amount"}
                      </Text>
                      <Text style={[styles.resultCardValue, { color: colors.foreground }]}>
                        {form.amount || "—"} {form.currency}
                      </Text>
                    </View>
                  </View>

                  {(clientName || tripName || studioName) && (
                    <View style={{ gap: 8 }}>
                      {!!clientName && (
                        <View style={[styles.entityRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Feather name="user" size={14} color={colors.primary} />
                          <Text style={[styles.entityLabel, { color: colors.mutedForeground }]}>
                            {language === "ar" ? "زبون:" : "Client:"}
                          </Text>
                          <Text style={[styles.entityName, { color: colors.foreground }]}>{clientName}</Text>
                        </View>
                      )}
                      {!!tripName && (
                        <View style={[styles.entityRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Feather name="map-pin" size={14} color={colors.primary} />
                          <Text style={[styles.entityLabel, { color: colors.mutedForeground }]}>
                            {language === "ar" ? "رحلة:" : "Trip:"}
                          </Text>
                          <Text style={[styles.entityName, { color: colors.foreground }]}>{tripName}</Text>
                        </View>
                      )}
                      {!!studioName && (
                        <View style={[styles.entityRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                          <Feather name="home" size={14} color={colors.primary} />
                          <Text style={[styles.entityLabel, { color: colors.mutedForeground }]}>
                            {language === "ar" ? "استديو:" : "Studio:"}
                          </Text>
                          <Text style={[styles.entityName, { color: colors.foreground }]}>{studioName}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {!!form.description && (
                    <View style={[styles.transcribedBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                      <Text style={[{ color: colors.mutedForeground, fontSize: 11, marginBottom: 2, textAlign: "right" }]}>
                        {language === "ar" ? "الوصف" : "Description"}
                      </Text>
                      <Text style={[{ color: colors.foreground, textAlign: "right", fontSize: 13 }]}>{form.description}</Text>
                    </View>
                  )}

                  <Pressable
                    style={[
                      styles.saveBtn,
                      { backgroundColor: colors.primary, marginTop: 4 },
                      (!form.amount || creating) && { opacity: 0.5 },
                    ]}
                    onPress={handleVoiceConfirmSave}
                    disabled={!form.amount || creating}
                  >
                    {creating ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>
                        {language === "ar" ? "✓ تأكيد وحفظ المعاملة" : "✓ Confirm & Save"}
                      </Text>
                    )}
                  </Pressable>

                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      style={[styles.halfBtn, { borderColor: colors.border, flex: 1 }]}
                      onPress={() => {
                        voiceSheetFlowRef.current = false;
                        setVoiceSheetVisible(false);
                        setShowModal(true);
                      }}
                    >
                      <Feather name="edit-2" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
                        {language === "ar" ? "تعديل يدوياً" : "Edit Manually"}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.halfBtn, { borderColor: "#ef4444", flex: 1 }]}
                      onPress={async () => {
                        setVoiceSheetVisible(false);
                        resetForm();
                        voiceSheetFlowRef.current = true;
                        const ok = await voice.startRecording();
                        if (!ok) {
                          Alert.alert(t("micPermissionDenied"));
                          voiceSheetFlowRef.current = false;
                        }
                      }}
                    >
                      <Feather name="refresh-cw" size={13} color="#ef4444" />
                      <Text style={[styles.skipText, { color: "#ef4444" }]}>
                        {language === "ar" ? "إعادة التسجيل" : "Record Again"}
                      </Text>
                    </Pressable>
                  </View>
                </ScrollView>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Create modal */}
      <Modal visible={showModal} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
            <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={() => setShowModal(false)}
                  style={[styles.backBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <Feather name={language === "ar" ? "arrow-right" : "arrow-left"} size={16} color={colors.foreground} />
                  <Text style={[styles.backBtnText, { color: colors.foreground }]}>
                    {language === "ar" ? "رجوع" : "Back"}
                  </Text>
                </Pressable>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>{t("newTransaction")}</Text>
                <View style={{ width: 72 }} />
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* AI parse */}
                <View style={[styles.aiBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 0 }]}>{t("orTypeDirectly")}</Text>
                  <View style={styles.aiRow}>
                    <Pressable
                      onPress={handleMic}
                      style={[
                        styles.micBtn,
                        { backgroundColor: voice.state === "recording" ? "#ef4444" : colors.primary },
                      ]}
                    >
                      <Feather
                        name={voice.state === "recording" ? "mic-off" : "mic"}
                        size={18}
                        color="#fff"
                      />
                    </Pressable>
                    <TextInput
                      style={[styles.input, { flex: 1, borderColor: colors.border, color: colors.foreground }]}
                      value={aiText}
                      onChangeText={setAiText}
                      placeholder={t("textPlaceholder")}
                      placeholderTextColor={colors.mutedForeground}
                      textAlign="right"
                      onSubmitEditing={handleParseText}
                    />
                    <Pressable
                      onPress={handleParseText}
                      disabled={parseMutation.isPending || !aiText.trim()}
                      style={[
                        styles.analyzeBtn,
                        { backgroundColor: colors.primary },
                        (parseMutation.isPending || !aiText.trim()) && { opacity: 0.5 },
                      ]}
                    >
                      {parseMutation.isPending ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.analyzeBtnText}>{t("analyzeBtn")}</Text>
                      )}
                    </Pressable>
                  </View>
                  {voice.state === "recording" && (
                    <Text style={[styles.aiStatus, { color: "#ef4444" }]}>{t("recording")}</Text>
                  )}
                  {voice.state === "transcribing" && (
                    <Text style={[styles.aiStatus, { color: colors.mutedForeground }]}>{t("transcribing")}</Text>
                  )}
                  {parseMutation.isPending && (
                    <Text style={[styles.aiStatus, { color: colors.mutedForeground }]}>{t("analyzing")}</Text>
                  )}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("typeLabel")}</Text>
                <View style={styles.segRow}>
                  {TX_TYPES.map((ty) => (
                    <Pressable
                      key={ty}
                      onPress={() => setForm((f) => ({ ...f, type: ty }))}
                      style={[
                        styles.segBtn,
                        { borderColor: colors.border },
                        form.type === ty && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                    >
                      <Text style={[styles.segText, form.type === ty && { color: "#fff" }]}>
                        {ty === "income"
                          ? t("typeIncome")
                          : ty === "expense"
                          ? t("typeExpense")
                          : ty === "payment"
                          ? t("typePayment")
                          : t("typeReceipt")}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("amountLabel")}</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  value={form.amount}
                  onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.mutedForeground}
                  textAlign="right"
                />

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("currencyLabel")}</Text>
                <Pressable
                  onPress={openCurrencyPicker}
                  style={[styles.selectBtn, { borderColor: colors.border }]}
                >
                  <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.selectText, { color: colors.foreground }]}>
                    {getCurrencyName(form.currency, language)} ({form.currency})
                  </Text>
                </Pressable>

                {showClients && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("clientLabel")}</Text>
                    <Pressable onPress={openClientPicker} style={[styles.selectBtn, { borderColor: colors.border }]}>
                      <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                      <Text style={[styles.selectText, { color: clientName ? colors.foreground : colors.mutedForeground }]}>
                        {clientName ?? t("noClient")}
                      </Text>
                    </Pressable>
                  </>
                )}

                {showTrips && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("tripLabel")}</Text>
                    <Pressable onPress={openTripPicker} style={[styles.selectBtn, { borderColor: colors.border }]}>
                      <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                      <Text style={[styles.selectText, { color: tripName ? colors.foreground : colors.mutedForeground }]}>
                        {tripName ?? t("noTripOption")}
                      </Text>
                    </Pressable>
                  </>
                )}

                {showStudios && (
                  <>
                    <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("studioLabel")}</Text>
                    <Pressable onPress={openStudioPicker} style={[styles.selectBtn, { borderColor: colors.border }]}>
                      <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
                      <Text style={[styles.selectText, { color: studioName ? colors.foreground : colors.mutedForeground }]}>
                        {studioName ?? t("noStudioOption")}
                      </Text>
                    </Pressable>
                  </>
                )}

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("statusLabel")}</Text>
                <View style={styles.segRow}>
                  {(["pending", "settled"] as const).map((st) => (
                    <Pressable
                      key={st}
                      onPress={() => setForm((f) => ({ ...f, status: st }))}
                      style={[
                        styles.segBtn,
                        { borderColor: colors.border },
                        form.status === st && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                    >
                      <Text style={[styles.segText, form.status === st && { color: "#fff" }]}>
                        {st === "pending" ? t("statusPending") : t("statusSettled")}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("dateLabel")}</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  value={form.date}
                  onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                  textAlign="left"
                />

                <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{t("descriptionLabel")}</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder={language === "ar" ? "وصف اختياري" : "Optional description"}
                  placeholderTextColor={colors.mutedForeground}
                  textAlign="right"
                />

                <Pressable
                  style={[styles.saveBtn, { backgroundColor: colors.primary }, (!form.amount || creating) && { opacity: 0.5 }]}
                  onPress={handleCreate}
                  disabled={!form.amount || creating}
                >
                  {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t("save")}</Text>}
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Generic picker modal */}
      <Modal visible={!!picker} animationType="slide" transparent presentationStyle="overFullScreen">
        <Pressable style={styles.modalOverlay} onPress={() => setPicker(null)}>
          <Pressable
            style={[styles.pickerContent, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{picker?.title}</Text>
              <Pressable onPress={() => setPicker(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {picker?.options.map((opt) => {
                const active = opt.value === picker.selected;
                return (
                  <Pressable
                    key={opt.value || "__none__"}
                    onPress={() => {
                      picker.onSelect(opt.value);
                      setPicker(null);
                    }}
                    style={[styles.pickerRow, { borderBottomColor: colors.border }]}
                  >
                    <Text style={[styles.pickerRowText, { color: colors.foreground }, active && { color: colors.primary, fontWeight: "700" }]}>
                      {opt.label}
                    </Text>
                    {active && <Feather name="check" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Resolution modals */}
      {renderResolution(clientResolution, {
        icon: "users",
        similarTitle: t("similarClientsTitle"),
        similarDesc:
          clientResolution.kind === "similar" ? t("similarClientsDesc", { name: clientResolution.inputName }) : "",
        newLabel:
          clientResolution.kind !== "idle"
            ? t("newClientLabel", {
                name: clientResolution.kind === "similar" ? clientResolution.inputName : clientResolution.name,
              })
            : "",
        skipText: t("skipClient"),
        newTitle: t("newClientTitle"),
        showPhone: true,
        onChoose: (id) => {
          resolveRef.current.clientId = id;
          setClientResolution({ kind: "idle" });
          advanceResolutionChain();
        },
        onSwitchToNew: () => {
          if (clientResolution.kind === "similar") {
            setClientResolution({ kind: "new", name: clientResolution.inputName });
          }
        },
        onConfirmNew: () => {
          if (clientResolution.kind === "new") {
            createClientMutation.mutate({
              data: { name: clientResolution.name, phone: newClientPhone || undefined },
            });
          }
        },
        onSkip: () => {
          resolveRef.current.clientId = null;
          setClientResolution({ kind: "idle" });
          setNewClientPhone("");
          advanceResolutionChain();
        },
      })}

      {renderResolution(tripResolution, {
        icon: "map-pin",
        similarTitle: t("similarTripsTitle"),
        similarDesc:
          tripResolution.kind === "similar" ? t("similarTripsDesc", { name: tripResolution.inputName }) : "",
        newLabel:
          tripResolution.kind !== "idle"
            ? t("newTripLabel", {
                name: tripResolution.kind === "similar" ? tripResolution.inputName : tripResolution.name,
              })
            : "",
        skipText: t("skipTrip"),
        newTitle: t("newTripTitle"),
        onChoose: (id) => {
          resolveRef.current.tripId = id;
          setTripResolution({ kind: "idle" });
          advanceResolutionChain();
        },
        onSwitchToNew: () => {
          if (tripResolution.kind === "similar") {
            setTripResolution({ kind: "new", name: tripResolution.inputName });
          }
        },
        onConfirmNew: () => {
          if (tripResolution.kind === "new") {
            createTripMutation.mutate({ data: { name: tripResolution.name, isShared: false } });
          }
        },
        onSkip: () => {
          resolveRef.current.tripId = null;
          setTripResolution({ kind: "idle" });
          advanceResolutionChain();
        },
      })}

      {renderResolution(studioResolution, {
        icon: "home",
        similarTitle: t("similarStudiosTitle"),
        similarDesc:
          studioResolution.kind === "similar" ? t("similarStudiosDesc", { name: studioResolution.inputName }) : "",
        newLabel:
          studioResolution.kind !== "idle"
            ? t("newStudioLabel", {
                name: studioResolution.kind === "similar" ? studioResolution.inputName : studioResolution.name,
              })
            : "",
        skipText: t("skipStudio"),
        newTitle: t("newStudioTitle"),
        onChoose: (id) => {
          resolveRef.current.studioId = id;
          setStudioResolution({ kind: "idle" });
          advanceResolutionChain();
        },
        onSwitchToNew: () => {
          if (studioResolution.kind === "similar") {
            setStudioResolution({ kind: "new", name: studioResolution.inputName });
          }
        },
        onConfirmNew: () => {
          if (studioResolution.kind === "new") {
            createStudioMutation.mutate({ data: { name: studioResolution.name } });
          }
        },
        onSkip: () => {
          resolveRef.current.studioId = null;
          setStudioResolution({ kind: "idle" });
          advanceResolutionChain();
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  filterDivider: {
    width: 1,
    marginHorizontal: 4,
    borderRadius: 1,
  },
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
  txCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
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
    marginTop: 2,
    textAlign: "right",
  },
  txAmount: {
    fontSize: 15,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  txCurrency: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
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
    alignItems: "center",
  },
  modalContent: {
    width: "100%",
    maxHeight: "90%",
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
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    fontWeight: "500" as const,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  segRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  segBtn: {
    flexGrow: 1,
    flexBasis: "22%",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  segText: {
    fontSize: 13,
    fontWeight: "500" as const,
    fontFamily: "Inter_500Medium",
    color: "#788090",
  },
  selectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  selectText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    flex: 1,
    textAlign: "right",
    marginRight: 8,
  },
  aiBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 4,
  },
  aiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  analyzeBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  aiStatus: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  saveBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  pickerContent: {
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  pickerRowText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  resolveOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  resolveCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
  },
  resolveHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  resolveTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    flex: 1,
    textAlign: "right",
  },
  resolveDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
    textAlign: "right",
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  matchAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  matchName: {
    fontSize: 14,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
    textAlign: "right",
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  skipBtn: {
    paddingVertical: 8,
    alignItems: "center",
  },
  skipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  nameBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  resolveActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  halfBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  halfBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  recTimerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  recTimerText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    color: "#ef4444",
  },
  recOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    padding: 16,
    paddingBottom: 24,
  },
  recCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
  },
  recCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ef4444",
  },
  recCardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
  },
  recCardTimer: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    fontWeight: "700" as const,
    letterSpacing: 1,
  },
  recLiveTextBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    minHeight: 72,
    justifyContent: "center",
  },
  recLiveText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    lineHeight: 26,
  },
  recLivePlaceholder: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  recCancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recStopBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 13,
  },
  voiceSheetContent: {
    width: "100%",
    maxHeight: "88%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    gap: 8,
  },
  voiceCenterView: {
    alignItems: "center" as const,
    paddingVertical: 36,
    gap: 14,
  },
  micPulseRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  bigMicBtn: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: "#ef4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  voiceStatusText: {
    fontSize: 16,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center" as const,
  },
  voiceHintText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
  },
  voiceExampleBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
  },
  voiceExampleText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center" as const,
    lineHeight: 20,
  },
  transcribedBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  resultGrid: {
    flexDirection: "row" as const,
    gap: 8,
  },
  resultCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  resultCardLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textAlign: "right" as const,
  },
  resultCardValue: {
    fontSize: 17,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    textAlign: "right" as const,
  },
  entityRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  entityLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  entityName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600" as const,
    flex: 1,
    textAlign: "right" as const,
  },
});
