import { useQueryClient } from "@tanstack/react-query";
import { useAiQuery } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import { usePathname, router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { ActionCards, type ExecutedAction } from "@/app/(tabs)/chat";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ExecutedAction[];
};

// Floating bubble that stays reachable from every tab (except the chat tab itself, which
// already is the assistant). Deliberately sits on the LEFT so it never collides with the
// existing right-side voice-recording FAB on the dashboard screen.
export function FloatingAssistant() {
  const pathname = usePathname();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { language } = settings;
  const t = useTr(language);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: "0", role: "assistant", content: t("chatWelcome") },
  ]);
  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput | null>(null);
  const { mutateAsync: askAi, isPending } = useAiQuery();

  // Hide on the chat tab itself — redundant there.
  if (pathname.startsWith("/chat")) return null;

  const bottomOffset = insets.bottom + 90;

  const sendMessage = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || isPending) return;
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: text }]);
    setInput("");
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const result = await askAi({ data: { question: text } });
      const answer = (result as any)?.answer ?? (language === "ar" ? "عذراً، لم أتمكن من فهم سؤالك." : "Sorry, I couldn't understand your question.");
      const actions = (result as any)?.data?.actions as ExecutedAction[] | undefined;
      setMessages((prev) => [...prev, { id: (Date.now() + 1).toString(), role: "assistant", content: answer, actions }]);
      if ((result as any)?.data?.actionsPerformed) queryClient.invalidateQueries();
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: language === "ar" ? "حدث خطأ في الاتصال. حاول تاني." : "Connection error. Please try again.",
        },
      ]);
    }
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={[
          styles.fab,
          { backgroundColor: colors.primary, bottom: bottomOffset, left: 20 },
        ]}
      >
        <Feather name="cpu" size={22} color="#fff" />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={[styles.panel, { backgroundColor: colors.background, paddingBottom: insets.bottom + 8 }]}
          >
            <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.foreground }]}>{t("aiAssistantTitle")}</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    router.push("/(tabs)/chat");
                  }}
                  style={[styles.iconBtn, { backgroundColor: colors.muted }]}
                >
                  <Feather name="maximize-2" size={16} color={colors.mutedForeground} />
                </Pressable>
                <Pressable onPress={() => setOpen(false)} style={[styles.iconBtn, { backgroundColor: colors.muted }]}>
                  <Feather name="x" size={16} color={colors.mutedForeground} />
                </Pressable>
              </View>
            </View>

            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 12, gap: 10 }}
              renderItem={({ item }) => (
                <View>
                  <View style={[styles.bubbleRow, item.role === "user" ? styles.userRow : styles.aiRow]}>
                    <View
                      style={[
                        styles.bubble,
                        item.role === "user"
                          ? { backgroundColor: colors.primary }
                          : { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          color: item.role === "user" ? "#fff" : colors.foreground,
                          textAlign: language === "ar" ? "right" : "left",
                        }}
                      >
                        {item.content}
                      </Text>
                    </View>
                  </View>
                  {item.role === "assistant" && item.actions && item.actions.length > 0 && (
                    <ActionCards actions={item.actions} language={language} colors={colors} onAsk={sendMessage} />
                  )}
                </View>
              )}
              ListFooterComponent={
                isPending ? (
                  <View style={styles.aiRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : null
              }
            />

            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <Pressable
                  onPress={() => {
                    const tpl = language === "ar" ? "اضف مصروف 450 تصوير لعرس سارة" : "Add expense 450 photography for Sarah's wedding";
                    setInput(tpl);
                    setTimeout(() => inputRef.current?.focus(), 80);
                  }}
                  style={[styles.actionPill, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 13 }}>{language === "ar" ? "أضف معاملة" : "Add"}</Text>
                </Pressable>

                <Pressable
                  onPress={() => sendMessage(language === "ar" ? "اعملي تقرير عن هاد الشهر" : "Generate a report for this month")}
                  style={[styles.actionPill, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 13 }}>{language === "ar" ? "تقرير" : "Report"}</Text>
                </Pressable>

                <Pressable
                  onPress={() => sendMessage(language === "ar" ? "مين متأخر بالدفع؟" : "Who's overdue on payments?")}
                  style={[styles.actionPill, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={{ color: colors.foreground, fontSize: 13 }}>{language === "ar" ? "المتأخرون" : "Overdue"}</Text>
                </Pressable>
              </View>

              <View style={[styles.inputBar, { borderTopColor: colors.border }]}>
                <TextInput
                  ref={(el) => (inputRef.current = el)}
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={input}
                  onChangeText={setInput}
                  placeholder={t("chatPlaceholder")}
                  placeholderTextColor={colors.mutedForeground}
                  textAlign={language === "ar" ? "right" : "left"}
                  onSubmitEditing={() => sendMessage()}
                />
                <Pressable
                  onPress={() => sendMessage()}
                  disabled={!input.trim() || isPending}
                  style={[styles.sendBtn, { backgroundColor: colors.primary }, (!input.trim() || isPending) && { opacity: 0.4 }]}
                >
                  <Feather name="send" size={15} color="#fff" />
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 50,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panel: {
    height: "72%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleRow: {
    maxWidth: "85%",
  },
  aiRow: {
    alignSelf: "flex-start",
  },
  userRow: {
    alignSelf: "flex-end",
  },
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
});