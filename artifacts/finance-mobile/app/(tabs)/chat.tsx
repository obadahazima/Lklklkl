import { useAiQuery } from "@workspace/api-client-react";
import type { AiHistoryItem } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
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

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
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
  const { state: voiceState, startRecording, stopAndTranscribe } = useVoiceRecording();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const QUICK_QUESTIONS = [t("q1"), t("q2"), t("q3"), t("q4")];

  const buildHistory = (current: Message[]): AiHistoryItem[] =>
    current
      .filter((m) => m.id !== "0")
      .map((m) => ({ role: m.role, content: m.content }));

  const sendMessage = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || isPending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    const history = buildHistory(messages);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const result = await askAi({ data: { question: text, history } });
      const answer = (result as any)?.answer ?? (language === "ar" ? "عذراً، لم أتمكن من فهم سؤالك." : "Sorry, I couldn't understand your question.");
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: answer,
      };
      setMessages((prev) => [...prev, aiMsg]);
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
        )}
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
});
