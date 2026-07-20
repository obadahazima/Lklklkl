import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSettings } from "@/contexts/SettingsContext";

const HELP_SEEN_KEY = "hasSeenAppHelp";

type Lang = "ar" | "en";

const CONTENT: Record<
  Lang,
  {
    title: string;
    intro: string;
    sections: { icon: keyof typeof Feather.glyphMap; title: string; body: string }[];
    settingsTitle: string;
    settingsBody: string;
    footer: string;
    close: string;
  }
> = {
  ar: {
    title: "مرحباً بك 👋 دليل استخدام التطبيق",
    intro:
      "هاد التطبيق بيساعدك تتابع مصاريفك ومداخيلك بس تحكيلها صوتياً أو كتابياً، وهو بيفهم عالتلقائي الزبون، العملة، وحتى التاريخ.",
    sections: [
      {
        icon: "mic",
        title: "إضافة معاملة صوتياً",
        body:
          'بس اضغط زر المايك وقول الجملة متلما بتحكي عادةً، متلاً: "دفعت ٥٠٠ درهم لأحمد أمس". التطبيق بيحلل الجملة وبيستخرج النوع، المبلغ، العملة، الزبون، وحتى التاريخ إذا كان مذكوراً — وإذا ما انذكر تاريخ، بيستخدم تلقائياً تاريخ اليوم.',
      },
      {
        icon: "credit-card",
        title: "أنواع المعاملات",
        body:
          "دخل ومصروف عامّين (بدون شخص محدد)، وقبض ودفع مرتبطين بزبون معيّن. التطبيق بيحدد النوع المناسب تلقائياً حسب الجملة.",
      },
      {
        icon: "users",
        title: "الزبائن",
        body:
          "كل زبون إله رصيد تلقائي (له/عليه) بيتحسب من كل معاملاته، وبيظهر جنب اسمه بالعملة الرئيسية يلي حددتها بالإعدادات.",
      },
      {
        icon: "map-pin",
        title: "الرحلات والاستوديوهات",
        body:
          "إذا فعّلتها بالإعدادات، فيك تربط المعاملات برحلة أو استوديو معيّن لتتبع أرباح ومصاريف كل واحد لحاله.",
      },
      {
        icon: "message-circle",
        title: "المساعد الذكي (الدردشة)",
        body:
          'اسأل أي سؤال مالي بلغتك العادية متلاً "قديش الزبون فلان عليه؟" أو "شو أرباح رحلة كذا؟" وبيجاوبك بالأرقام الفعلية من بياناتك.',
      },
      {
        icon: "trending-up",
        title: "أسعار الصرف",
        body:
          "التطبيق بيحوّل كل شي تلقائياً للعملة الرئيسية عندك، وفيك تخليه ياخد سعر الصرف تلقائياً أو تحطه يدوياً من الإعدادات.",
      },
    ],
    settingsTitle: "⚙️ الإعدادات",
    settingsBody:
      "من صفحة الإعدادات فيك تغيّر اللغة، العملة الرئيسية، العملات المفعّلة، سعر الصرف (تلقائي/يدوي)، وتظهر/تخفي أقسام الزبائن والرحلات والاستوديوهات حسب احتياجك.",
    footer: "فيك ترجع لهالدليل بأي وقت من زر (؟) بالأعلى.",
    close: "فهمت، إغلاق",
  },
  en: {
    title: "Welcome 👋 App Guide",
    intro:
      "This app helps you track your income and expenses just by talking or typing naturally — it automatically understands the client, currency, and even the date.",
    sections: [
      {
        icon: "mic",
        title: "Add a transaction by voice",
        body:
          'Just tap the mic button and say a sentence naturally, e.g. "Paid 500 AED to Ahmad yesterday." The app extracts the type, amount, currency, client, and even the date if mentioned — if no date is mentioned, it defaults to today.',
      },
      {
        icon: "credit-card",
        title: "Transaction types",
        body:
          "General income/expense (no specific person), and receipt/payment tied to a specific client. The app picks the right type automatically based on the sentence.",
      },
      {
        icon: "users",
        title: "Clients",
        body:
          "Each client has an automatic balance (owed to you / you owe) calculated from all their transactions, shown next to their name in your primary currency.",
      },
      {
        icon: "map-pin",
        title: "Trips & Studios",
        body:
          "If enabled in Settings, you can link transactions to a specific trip or studio to track each one's profit and expenses separately.",
      },
      {
        icon: "message-circle",
        title: "AI Assistant (Chat)",
        body:
          'Ask any financial question naturally, e.g. "How much does Ahmad owe?" or "What\'s the profit on trip X?" and get answers based on your real data.',
      },
      {
        icon: "trending-up",
        title: "Exchange rates",
        body:
          "The app automatically converts everything to your primary currency, and you can set it to fetch rates automatically or enter them manually from Settings.",
      },
    ],
    settingsTitle: "⚙️ Settings",
    settingsBody:
      "From the Settings page you can change the language, primary currency, active currencies, exchange rate mode (auto/manual), and show/hide the Clients, Trips, and Studios sections as needed.",
    footer: "You can revisit this guide anytime from the (?) button at the top.",
    close: "Got it, close",
  },
};

export function HelpOverlay() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const language = (settings.language as Lang) ?? "ar";
  const [visible, setVisible] = useState(false);
  const isIOS = Platform.OS === "ios";

  useEffect(() => {
    AsyncStorage.getItem(HELP_SEEN_KEY)
      .then((val) => {
        if (!val) {
          setVisible(true);
          AsyncStorage.setItem(HELP_SEEN_KEY, "1").catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  const c = CONTENT[language];
  const isRTL = language === "ar";
  const topOffset = Math.max(insets.top, isIOS ? 12 : 8) + (isIOS ? 4 : 6);

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          styles.buttonWrap,
          { top: topOffset, [isRTL ? "left" : "right"]: 14 } as any,
        ]}
      >
        <Pressable
          onPress={() => setVisible(true)}
          style={[styles.helpBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          hitSlop={8}
        >
          <Feather name="help-circle" size={18} color={colors.primary} />
        </Pressable>
      </View>

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) },
            ]}
          >
            <View style={styles.sheetHandle} />
            <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 6 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.title, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
                {c.title}
              </Text>
              <Text
                style={[
                  styles.intro,
                  { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" },
                ]}
              >
                {c.intro}
              </Text>

              {c.sections.map((s) => (
                <View
                  key={s.title}
                  style={[styles.row, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                >
                  <View style={[styles.iconBubble, { backgroundColor: colors.primary + "1A" }]}>
                    <Feather name={s.icon} size={16} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.foreground, textAlign: isRTL ? "right" : "left" },
                      ]}
                    >
                      {s.title}
                    </Text>
                    <Text
                      style={[
                        styles.sectionBody,
                        { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" },
                      ]}
                    >
                      {s.body}
                    </Text>
                  </View>
                </View>
              ))}

              <View
                style={[
                  styles.row,
                  styles.settingsRow,
                  { flexDirection: isRTL ? "row-reverse" : "row", borderTopColor: colors.border },
                ]}
              >
                <View style={[styles.iconBubble, { backgroundColor: "#F59E0B1A" }]}>
                  <Feather name="settings" size={16} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      { color: colors.foreground, textAlign: isRTL ? "right" : "left" },
                    ]}
                  >
                    {c.settingsTitle}
                  </Text>
                  <Text
                    style={[
                      styles.sectionBody,
                      { color: colors.mutedForeground, textAlign: isRTL ? "right" : "left" },
                    ]}
                  >
                    {c.settingsBody}
                  </Text>
                </View>
              </View>

              <Text style={[styles.footer, { color: colors.mutedForeground }]}>{c.footer}</Text>

              <Pressable
                onPress={() => setVisible(false)}
                style={[styles.closeBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={styles.closeBtnText}>{c.close}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  buttonWrap: {
    position: "absolute",
    zIndex: 50,
  },
  helpBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#00000022",
    marginTop: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  intro: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  row: {
    gap: 10,
    marginBottom: 14,
    alignItems: "flex-start",
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: "600",
    marginBottom: 2,
  },
  sectionBody: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  settingsRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  footer: {
    fontSize: 11,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  closeBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});