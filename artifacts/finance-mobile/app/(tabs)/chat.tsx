import { useQueryClient } from "@tanstack/react-query";
import { useAiQuery } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
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
import { useSettings } from "@/contexts/SettingsContext";
import { useTr } from "@/lib/i18n";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";

export type ExecutedAction = { name: string; success: boolean; result: Record<string, unknown> };

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ExecutedAction[];
};

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { language } = settings;
  const t = useTr(language);
  const flatListRef = useRef<FlatList>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      role: "assistant",
      content: t("chatWelcome"),
    },
  ]);

  const { mutateAsync: askAi, isPending } = useAiQuery();
  const queryClient = useQueryClient();
  const { state: voiceState, startRecording, stopAndTranscribe } = useVoiceRecording();
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadFailed, setHistoryLoadFailed] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const QUICK_QUESTIONS = [t("q1"), t("q2"), t("q3"), t("q4")];

  // Load the real, persistent conversation from the server — so past chats show up again
  // instead of resetting every time the app is reopened. Retries transient failures a few
  // times, and — if it still fails — leaves a visible retry state instead of silently
  // pretending the (still-saved) conversation is gone.
  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryLoadFailed(false);
    const RETRIES = 3;
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        const res = await customFetch<{ messages: { id: number; role: "user" | "model"; content: string }[] }>("/ai/history");
        if (res.messages.length > 0) {
          setMessages((prev) => [
            prev[0],
            ...res.messages.map((m) => ({
              id: String(m.id),
              role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
              content: m.content,
            })),
          ]);
        }
        setHistoryLoading(false);
        return;
      } catch {
        if (attempt < RETRIES) await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    setHistoryLoading(false);
    setHistoryLoadFailed(true);
  }

  useEffect(() => {
    let cancelled = false;
    loadHistory().catch(() => {
      if (!cancelled) setHistoryLoadFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || isPending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // History is tracked server-side now (persisted per user) — only the new question is sent.
      const result = await askAi({ data: { question: text } });
      const answer = (result as any)?.answer ?? (language === "ar" ? "عذراً، لم أتمكن من فهم سؤالك." : "Sorry, I couldn't understand your question.");
      const actions = (result as any)?.data?.actions as ExecutedAction[] | undefined;
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: answer,
        actions,
      };
      setMessages((prev) => [...prev, aiMsg]);
      // If the assistant added/edited/deleted a transaction, refresh all cached data
      // (transactions list, dashboard, client balances, etc.) so the UI reflects it immediately.
      if ((result as any)?.data?.actionsPerformed) {
        queryClient.invalidateQueries();
      }
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: e?.message?.includes("quota") || e?.status === 429
          ? (language === "ar" ? "عذراً، انتهى حد الاستخدام المجاني للذكاء الاصطناعي." : "Sorry, the AI usage quota has been exceeded.")
          : (language === "ar" ? "حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى." : "Connection error. Please try again."),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  };

  const handleVoice = async () => {
    if (voiceState === "transcribing") return;
    if (voiceState === "recording") {
      const text = await stopAndTranscribe();
      if (text) setInput(text);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await startRecording();
  };

  const showQuickQuestions = messages.filter((m) => m.id !== "0").length === 0;
  const isRecording = voiceState === "recording";
  const isTranscribing = voiceState === "transcribing";

  return (
    <View style={[{ flex: 1, backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.aiDot, { backgroundColor: colors.primary }]} />
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{t("aiAssistantTitle")}</Text>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: bottomPad + 100 }}
        renderItem={({ item }) => (
          <View>
            <View style={[
              styles.bubbleRow,
              item.role === "user" ? styles.userRow : styles.aiRow,
            ]}>
              {item.role === "assistant" && (
                <View style={[styles.aiAvatar, { backgroundColor: colors.accent }]}>
                  <Feather name="cpu" size={14} color={colors.primary} />
                </View>
              )}
              <View style={[
                styles.bubble,
                item.role === "user"
                  ? [styles.userBubble, { backgroundColor: colors.primary }]
                  : [styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }],
              ]}>
                <Text style={[
                  styles.bubbleText,
                  { color: item.role === "user" ? "#fff" : colors.foreground, textAlign: language === "ar" ? "right" : "left" },
                ]}>
                  {item.content}
                </Text>
              </View>
            </View>
            {item.role === "assistant" && item.actions && item.actions.length > 0 && (
              <ActionCards actions={item.actions} language={language} colors={colors} onAsk={sendMessage} />
            )}
          </View>
        )}
        ListHeaderComponent={
          historyLoadFailed ? (
            <Pressable
              onPress={() => loadHistory()}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                backgroundColor: "#fee2e2",
                borderColor: "#fca5a5",
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: "#b91c1c", fontSize: 12, flex: 1, textAlign: language === "ar" ? "right" : "left" }}>
                {language === "ar"
                  ? "تعذّر تحميل المحادثة السابقة (مشكلة اتصال مؤقتة). المحادثة القديمة محفوظة بأمان — إضغط لإعادة المحاولة."
                  : "Couldn't load your previous conversation (a temporary connection issue). Your old conversation is safely saved — tap to retry."}
              </Text>
              <Feather name="refresh-cw" size={14} color="#b91c1c" />
            </Pressable>
          ) : historyLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, paddingHorizontal: 4 }}>
              <ActivityIndicator size="small" color={colors.mutedForeground} />
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                {language === "ar" ? "يحمّل المحادثة السابقة..." : "Loading previous conversation..."}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          isPending ? (
            <View style={styles.aiRow}>
              <View style={[styles.aiAvatar, { backgroundColor: colors.accent }]}>
                <Feather name="cpu" size={14} color={colors.primary} />
              </View>
              <View style={[styles.bubble, styles.aiBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            </View>
          ) : null
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {showQuickQuestions && (
          <View style={[styles.quickWrap, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Text style={[styles.quickTitle, { color: colors.mutedForeground }]}>{t("quickQuestions")}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
            >
              {QUICK_QUESTIONS.map((q) => (
                <Pressable
                  key={q}
                  onPress={() => sendMessage(q)}
                  disabled={isPending}
                  style={[styles.quickChip, { backgroundColor: colors.accent, borderColor: colors.border }, isPending && { opacity: 0.5 }]}
                >
                  <Text style={[styles.quickChipText, { color: colors.primary }]}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {isTranscribing && (
          <View style={[styles.statusBar, { backgroundColor: colors.card }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{t("transcribing")}</Text>
          </View>
        )}

        <View style={[
          styles.inputBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: bottomPad + 8,
          },
        ]}>
          <Pressable
            onPress={handleVoice}
            disabled={isTranscribing}
            style={[
              styles.voiceBtn,
              { backgroundColor: isRecording ? "#ef4444" : colors.muted },
              isTranscribing && { opacity: 0.4 },
            ]}
          >
            <Feather name={isRecording ? "mic-off" : "mic"} size={16} color={isRecording ? "#fff" : colors.mutedForeground} />
          </Pressable>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
            value={input}
            onChangeText={setInput}
            placeholder={t("chatPlaceholder")}
            placeholderTextColor={colors.mutedForeground}
            multiline
            maxLength={500}
            textAlign={language === "ar" ? "right" : "left"}
            onSubmitEditing={() => sendMessage()}
            blurOnSubmit={false}
          />
          <Pressable
            onPress={() => sendMessage()}
            disabled={!input.trim() || isPending}
            style={[
              styles.sendBtn,
              { backgroundColor: colors.primary },
              (!input.trim() || isPending) && { opacity: 0.4 },
            ]}
          >
            <Feather name="send" size={16} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export function ActionCards({
  actions,
  language,
  colors,
  onAsk,
}: {
  actions: ExecutedAction[];
  language: "ar" | "en";
  colors: ReturnType<typeof useColors>;
  onAsk: (text: string) => void;
}) {
  return (
    <View style={{ marginLeft: language === "ar" ? 0 : 36, marginRight: language === "ar" ? 36 : 0, marginTop: 6, gap: 8 }}>
      {actions.map((action, i) => {
        if (!action.success) return null;

        if (action.name === "get_overdue_clients") {
          const clients = (action.result.overdueClients as Array<{
            clientId: number;
            clientName: string;
            daysOverdue: number;
          }>) ?? [];
          if (clients.length === 0) return null;
          return (
            <View key={i} style={{ gap: 8 }}>
              {clients.map((c) => (
                <View
                  key={c.clientId}
                  style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <Feather name="alert-circle" size={16} color="#f59e0b" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600" as const, color: colors.foreground }}>
                        {c.clientName}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                        {language === "ar" ? `متأخر ${c.daysOverdue} يوم` : `${c.daysOverdue} days overdue`}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() =>
                      onAsk(
                        language === "ar"
                          ? `جهزلي تذكير واتساب لـ ${c.clientName}`
                          : `Prepare a whatsapp reminder for ${c.clientName}`,
                      )
                    }
                    style={[styles.actionBtn, { backgroundColor: colors.accent, borderColor: colors.border }]}
                  >
                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" as const }}>
                      {language === "ar" ? "جهّز تذكير" : "Prepare"}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          );
        }

        if (action.name === "prepare_whatsapp_reminder") {
          const link = action.result.whatsappLink as string | undefined;
          const clientName = action.result.clientName as string | undefined;
          if (!link) return null;
          return (
            <Pressable
              key={i}
              onPress={() => Linking.openURL(link)}
              style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="message-circle" size={16} color="#16a34a" />
              <Text style={{ fontSize: 13, color: colors.foreground, flex: 1 }}>
                {language === "ar"
                  ? `افتح واتساب وابعث التذكير لـ ${clientName}`
                  : `Open WhatsApp and send reminder to ${clientName}`}
              </Text>
            </Pressable>
          );
        }

        if (action.name === "generate_report") {
          const totals = (action.result.totals as Array<{
            currency: string;
            income: number;
            expense: number;
            net: number;
          }>) ?? [];
          if (totals.length === 0) return null;
          return (
            <View key={i} style={[styles.reportCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Feather name="bar-chart-2" size={16} color={colors.primary} />
                <Text style={{ fontSize: 13, fontWeight: "600" as const, color: colors.foreground }}>
                  {language === "ar" ? "التقرير المالي" : "Financial report"}
                </Text>
              </View>
              {totals.map((t) => (
                <View key={t.currency} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground }}>{t.currency}</Text>
                  <Text style={{ fontSize: 11, color: colors.foreground }}>
                    {language === "ar" ? "دخل" : "In"} {t.income.toFixed(0)} ·{" "}
                    {language === "ar" ? "مصروف" : "Out"} {t.expense.toFixed(0)} ·{" "}
                    <Text style={{ fontWeight: "700" as const, color: t.net >= 0 ? "#16a34a" : "#ef4444" }}>
                      {language === "ar" ? "صافي" : "Net"} {t.net.toFixed(0)}
                    </Text>
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  aiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  bubbleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    maxWidth: "85%",
  },
  aiRow: {
    alignSelf: "flex-start",
  },
  userRow: {
    alignSelf: "flex-end",
    flexDirection: "row-reverse",
  },
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: {
    borderRadius: 16,
    padding: 12,
    maxWidth: "100%",
  },
  aiBubble: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  userBubble: {
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  quickWrap: {
    paddingTop: 10,
    paddingBottom: 4,
    borderTopWidth: 1,
  },
  quickTitle: {
    fontSize: 11,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 12,
    marginBottom: 8,
    textAlign: "right",
  },
  quickRow: {
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: "row",
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  voiceBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  reportCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});