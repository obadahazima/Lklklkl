import { useAuth, useUser } from "@clerk/expo";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/contexts/SettingsContext";

const API_BASE = "https://workspaceapi-server-production-85e3.up.railway.app";

type Msg = { role: "user" | "model"; text: string };
type Cfg = { email: string; whatsapp: string | null };

const T = {
  ar: {
    title: "الدعم",
    hello: "أهلاً! أنا مساعد الدعم. اسألني عن أي شي بخصوص التطبيق وبساعدك. لا تكتب كلمات سر أو أرقام بطاقات.",
    placeholder: "اكتب سؤالك...",
    send: "إرسال",
    human: "تواصل مع شخص",
    humanTitle: "تواصل مع الدعم مباشرة",
    whatsapp: "واتساب",
    email: "إيميل",
    close: "إغلاق",
    error: "تعذّر الرد حالياً. تقدر تتواصل مع الدعم مباشرة:",
    tooMany: "رسائل كتير بوقت قصير، جرّب بعد شوي.",
    intro: "مرحباً، أحتاج مساعدة بتطبيق Billy Bills AI.",
  },
  en: {
    title: "Support",
    hello: "Hi! I'm the support assistant. Ask me anything about the app. Please don't share passwords or card numbers.",
    placeholder: "Type your question...",
    send: "Send",
    human: "Talk to a person",
    humanTitle: "Contact support directly",
    whatsapp: "WhatsApp",
    email: "Email",
    close: "Close",
    error: "Couldn't reply right now. You can contact support directly:",
    tooMany: "Too many messages in a short time, please try again shortly.",
    intro: "Hello, I need help with Billy Bills AI.",
  },
} as const;

export function SupportChat({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { settings } = useSettings();
  const colors = useColors();
  const isEn = settings.language === "en";
  const t = T[isEn ? "en" : "ar"];
  const align = isEn ? "left" : "right";
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHuman, setShowHuman] = useState(false);
  const [note, setNote] = useState("");
  const [cfg, setCfg] = useState<Cfg>({ email: "onhazima@gmail.com", whatsapp: null });
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const token = await getToken();
        const r = await fetch(`${API_BASE}/api/support/config`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) setCfg(await r.json());
      } catch {}
    })();
  }, [visible, getToken]);

  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.text ?? "";
  const who = user?.primaryEmailAddress?.emailAddress ?? "";
  const body = `${t.intro}\n${who ? `Account: ${who}\n` : ""}${lastUser ? `Issue: ${lastUser}` : ""}`;

  const openWhatsApp = () => cfg.whatsapp && Linking.openURL(`https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(body)}`);
  const openEmail = () =>
    Linking.openURL(`mailto:${cfg.email}?subject=${encodeURIComponent("Billy Bills AI support")}&body=${encodeURIComponent(body)}`);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setNote("");
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/support/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (res.status === 429) {
        setNote(t.tooMany);
      } else if (!res.ok) {
        throw new Error("failed");
      } else {
        const data = (await res.json()) as { reply: string; needsHuman: boolean };
        if (data.reply) setMsgs([...next, { role: "model", text: data.reply }]);
        if (data.needsHuman) setShowHuman(true);
      }
    } catch {
      setNote(t.error);
      setShowHuman(true);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const bubble = (mine: boolean) => ({
    alignSelf: mine ? ("flex-end" as const) : ("flex-start" as const),
    maxWidth: "85%" as const,
    backgroundColor: mine ? colors.primary : colors.muted,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            style={{
              flexDirection: isEn ? "row" : "row-reverse", justifyContent: "space-between", alignItems: "center",
              paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>{t.title}</Text>
            <View style={{ flexDirection: "row", gap: 16 }}>
              <Pressable onPress={() => setShowHuman(true)}>
                <Text style={{ color: colors.primary, fontSize: 13 }}>{t.human}</Text>
              </Pressable>
              <Pressable onPress={onClose}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>{t.close}</Text>
              </Pressable>
            </View>
          </View>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            <View style={bubble(false)}>
              <Text style={{ color: colors.foreground, textAlign: align, lineHeight: 21 }}>{t.hello}</Text>
            </View>
            {msgs.map((m, i) => (
              <View key={i} style={bubble(m.role === "user")}>
                <Text style={{ color: m.role === "user" ? "#fff" : colors.foreground, textAlign: align, lineHeight: 21 }}>{m.text}</Text>
              </View>
            ))}
            {busy && <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start" }} />}
            {!!note && <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: align }}>{note}</Text>}
            {showHuman && (
              <View style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 14, padding: 12, gap: 10 }}>
                <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13, textAlign: align }}>{t.humanTitle}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {cfg.whatsapp && (
                    <Pressable onPress={openWhatsApp} style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{t.whatsapp}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={openEmail} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
                    <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 13 }}>{t.email}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
          <View style={{ flexDirection: isEn ? "row" : "row-reverse", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={send}
              maxLength={1000}
              placeholder={t.placeholder}
              placeholderTextColor={colors.mutedForeground}
              style={{
                flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
                paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, textAlign: align,
              }}
            />
            <Pressable
              onPress={send}
              disabled={busy || !input.trim()}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 16, justifyContent: "center", opacity: busy || !input.trim() ? 0.5 : 1 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>{t.send}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
