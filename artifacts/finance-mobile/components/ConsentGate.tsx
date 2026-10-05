import { useAuth, useClerk, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/contexts/SettingsContext";
import { TERMS_VERSION, WEB_URL } from "@/constants/legal";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://workspaceapi-server-production-85e3.up.railway.app";

const T = {
  ar: {
    title: "قبل ما تبدأ",
    intro: "لاستخدام Billy Bills AI لازم توافق على الشروط وسياسة الخصوصية.",
    points: [
      "بياناتك المالية محفوظة بحسابك فقط، ويمكنك حذفها بالكامل في أي وقت.",
      "المساعد الذكي والتسجيلات الصوتية تُرسل إلى Google Gemini لمعالجتها.",
      "المساعد قد يخطئ، وليس بديلاً عن محاسب أو مستشار مالي أو قانوني.",
      "التطبيق للبالغين (18+) وغير مقدّم في الاتحاد الأوروبي والمملكة المتحدة والولايات المتحدة.",
    ],
    agree: "أوافق على",
    terms: "شروط الاستخدام",
    and: "و",
    privacy: "سياسة الخصوصية",
    accept: "موافق ومتابعة",
    decline: "لا أوافق (تسجيل الخروج)",
    error: "تعذر حفظ الموافقة، حاول مرة أخرى",
  },
  en: {
    title: "Before you start",
    intro: "To use Billy Bills AI you need to accept the Terms and the Privacy Policy.",
    points: [
      "Your financial data is stored in your account only, and you can delete it completely at any time.",
      "The AI assistant and voice recordings are sent to Google Gemini for processing.",
      "The assistant can make mistakes and is not a substitute for an accountant or financial or legal advisor.",
      "For adults (18+). Not offered in the European Union, the United Kingdom or the United States.",
    ],
    agree: "I agree to the",
    terms: "Terms of Use",
    and: "and",
    privacy: "Privacy Policy",
    accept: "Accept and continue",
    decline: "I don't agree (sign out)",
    error: "Couldn't save your consent, please try again",
  },
} as const;

/** Blocks the app until the signed-in user has accepted the CURRENT terms version. */
export function ConsentGate({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { settings } = useSettings();
  const colors = useColors();
  const isEn = settings.language === "en";
  const t = T[isEn ? "en" : "ar"];
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [done, setDone] = useState(false);

  if (!isLoaded) return null;
  const accepted = (user?.publicMetadata as { consent?: { version?: string } } | undefined)?.consent?.version === TERMS_VERSION;
  if (accepted || done) return <>{children}</>;

  const accept = async () => {
    setBusy(true);
    setErr(false);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/consent`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version: TERMS_VERSION }),
      });
      if (!res.ok) throw new Error("failed");
      setDone(true);
      user?.reload().catch(() => {});
    } catch {
      setErr(true);
      setBusy(false);
    }
  };

  const align = isEn ? "left" : "right";
  const link = { color: colors.primary, textDecorationLine: "underline" as const };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>
        <Text style={{ fontSize: 22, fontWeight: "700", color: colors.foreground, textAlign: align }}>{t.title}</Text>
        <Text style={{ fontSize: 14, color: colors.mutedForeground, textAlign: align }}>{t.intro}</Text>
        {t.points.map((p) => (
          <Text key={p} style={{ fontSize: 14, color: colors.mutedForeground, textAlign: align, lineHeight: 21 }}>
            {"\u2022 "}{p}
          </Text>
        ))}
        <Pressable
          onPress={() => setChecked((c) => !c)}
          style={{ flexDirection: isEn ? "row" : "row-reverse", alignItems: "flex-start", gap: 10, marginTop: 6 }}
        >
          <View
            style={{
              width: 22, height: 22, borderRadius: 6, borderWidth: 2, marginTop: 1,
              borderColor: checked ? colors.primary : colors.mutedForeground,
              backgroundColor: checked ? colors.primary : "transparent",
              alignItems: "center", justifyContent: "center",
            }}
          >
            {checked && <Feather name="check" size={14} color="#fff" />}
          </View>
          <Text style={{ flex: 1, fontSize: 14, color: colors.foreground, textAlign: align, lineHeight: 22 }}>
            {t.agree}{" "}
            <Text style={link} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/terms`)}>{t.terms}</Text>{" "}
            {t.and}{" "}
            <Text style={link} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/privacy`)}>{t.privacy}</Text>
          </Text>
        </Pressable>
        {err && <Text style={{ color: "#ef4444", fontSize: 12, textAlign: align }}>{t.error}</Text>}
        <Pressable
          onPress={accept}
          disabled={!checked || busy}
          style={{
            backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center",
            opacity: !checked || busy ? 0.5 : 1, marginTop: 6,
          }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{t.accept}</Text>}
        </Pressable>
        <Pressable onPress={() => signOut()} style={{ alignItems: "center", padding: 10 }}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{t.decline}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
