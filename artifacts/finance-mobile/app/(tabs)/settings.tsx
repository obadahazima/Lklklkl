import { useClerk } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useSettings, AVAILABLE_CURRENCIES } from "@/contexts/SettingsContext";
import type { AppTheme } from "@/contexts/SettingsContext";

const MAX_CURRENCIES = 5;

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { signOut } = useClerk();
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const { language, currencies, primaryCurrency, exchangeRateMode, manualRates, showClients, showTrips, showStudios, theme } = settings;

  const [localRates, setLocalRates] = useState<Record<string, number>>({ ...manualRates });

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const isAr = language === "ar";
  const availableToAdd = AVAILABLE_CURRENCIES.filter((c) => !currencies.includes(c.code));

  function getCurrencyName(code: string) {
    const c = AVAILABLE_CURRENCIES.find((x) => x.code === code);
    return c ? (isAr ? c.nameAr : c.nameEn) : code;
  }

  function removeCurrency(code: string) {
    if (currencies.length <= 1) return;
    const next = currencies.filter((c) => c !== code);
    const newPrimary = next.includes(primaryCurrency) ? primaryCurrency : next[0];
    updateSettings({ currencies: next, primaryCurrency: newPrimary });
  }

  function addCurrency(code: string) {
    if (currencies.length >= MAX_CURRENCIES) return;
    updateSettings({ currencies: [...currencies, code] });
    setShowCurrencyPicker(false);
  }

  function saveRates() {
    updateSettings({ manualRates: { ...localRates, AED: 1 } });
    Alert.alert(isAr ? "تم الحفظ" : "Saved", isAr ? "تم حفظ أسعار الصرف" : "Exchange rates saved");
  }

  // Show all currencies except primary — format: "1 PRIMARY = X CODE"
  const rateInputCurrencies = currencies.filter((c) => c !== primaryCurrency);

  function getDisplayVal(code: string): string {
    const primRate = primaryCurrency === "AED" ? 1 : (localRates[primaryCurrency] ?? 1);
    const codeRate = code === "AED" ? 1 : (localRates[code] ?? 0);
    if (codeRate <= 0) return "";
    const val = primRate / codeRate;
    if (val >= 1000) return String(Math.round(val));
    if (val >= 1) return String(+val.toFixed(2));
    return String(+val.toFixed(4));
  }

  function handleRateInput(code: string, raw: string) {
    const displayVal = parseFloat(raw);
    if (!displayVal || displayVal <= 0) return;
    setLocalRates((prev) => {
      const primRate = primaryCurrency === "AED" ? 1 : (prev[primaryCurrency] ?? 1);
      if (code === "AED") {
        return { ...prev, [primaryCurrency]: displayVal };
      }
      return { ...prev, [code]: primRate / displayVal };
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {isAr ? "الإعدادات" : "Settings"}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: bottomPad + 100, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Language */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="globe" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {isAr ? "اللغة" : "Language"}
            </Text>
          </View>
          <View style={styles.segRow}>
            {(["ar", "en"] as const).map((lang) => (
              <Pressable
                key={lang}
                onPress={() => updateSettings({ language: lang })}
                style={[
                  styles.segBtn,
                  { borderColor: colors.border },
                  language === lang && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {language === lang && <Feather name="check" size={13} color="#fff" />}
                <Text style={[styles.segText, { color: language === lang ? "#fff" : colors.mutedForeground }]}>
                  {lang === "ar" ? "العربية" : "English"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Currencies */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="dollar-sign" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {isAr ? "العملات" : "Currencies"}
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                {isAr ? "حتى 5 عملات" : "Up to 5 currencies"}
              </Text>
            </View>
          </View>
          <View style={{ padding: 12, gap: 8 }}>
            {currencies.map((code) => (
              <View key={code} style={[styles.currencyRow, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[styles.currencyBadge, { backgroundColor: colors.accent }]}>
                    <Text style={[styles.currencyBadgeText, { color: colors.primary }]}>{code}</Text>
                  </View>
                  <Text style={[styles.currencyName, { color: colors.foreground }]}>{getCurrencyName(code)}</Text>
                </View>
                {currencies.length > 1 && (
                  <Pressable onPress={() => removeCurrency(code)} hitSlop={8}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>
            ))}

            {currencies.length < MAX_CURRENCIES && (
              <>
                <Pressable
                  onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
                  style={[styles.addCurrencyBtn, { borderColor: colors.border }]}
                >
                  <Feather name="plus" size={15} color={colors.mutedForeground} />
                  <Text style={[styles.addCurrencyText, { color: colors.mutedForeground }]}>
                    {isAr ? "إضافة عملة" : "Add currency"}
                  </Text>
                  <Feather name={showCurrencyPicker ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
                </Pressable>
                {showCurrencyPicker && (
                  <View style={[styles.currencyPicker, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    {availableToAdd.length === 0 ? (
                      <Text style={[styles.noMore, { color: colors.mutedForeground }]}>
                        {isAr ? "لا توجد عملات أخرى" : "No more currencies"}
                      </Text>
                    ) : (
                      availableToAdd.map((c, i) => (
                        <Pressable
                          key={c.code}
                          onPress={() => addCurrency(c.code)}
                          style={[
                            styles.currencyPickerItem,
                            { borderBottomColor: colors.border },
                            i === availableToAdd.length - 1 && { borderBottomWidth: 0 },
                          ]}
                        >
                          <View style={[styles.currencyBadge, { backgroundColor: colors.accent }]}>
                            <Text style={[styles.currencyBadgeText, { color: colors.primary }]}>{c.code}</Text>
                          </View>
                          <Text style={[styles.currencyName, { color: colors.foreground }]}>
                            {isAr ? c.nameAr : c.nameEn}
                          </Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Primary Currency */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="star" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {isAr ? "العملة الأساسية" : "Primary Currency"}
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                {isAr ? "للعرض في الداشبورد" : "Shown on dashboard"}
              </Text>
            </View>
          </View>
          <View style={styles.primaryRow}>
            {currencies.map((code) => (
              <Pressable
                key={code}
                onPress={() => updateSettings({ primaryCurrency: code })}
                style={[
                  styles.primaryBtn,
                  { borderColor: colors.border },
                  primaryCurrency === code && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {primaryCurrency === code && <Feather name="check" size={13} color="#fff" />}
                <Text style={[styles.segText, { color: primaryCurrency === code ? "#fff" : colors.foreground }]}>{code}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Theme */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name={theme === "dark" ? "moon" : "sun"} size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {isAr ? "المظهر" : "Appearance"}
              </Text>
            </View>
          </View>
          <View style={styles.segRow}>
            {(["light", "dark"] as AppTheme[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => updateSettings({ theme: t })}
                style={[
                  styles.segBtn,
                  { borderColor: colors.border },
                  theme === t && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <Feather name={t === "light" ? "sun" : "moon"} size={14} color={theme === t ? colors.primaryForeground : colors.mutedForeground} />
                <Text style={[styles.segText, { color: theme === t ? colors.primaryForeground : colors.mutedForeground }]}>
                  {t === "light" ? (isAr ? "نهاري" : "Light") : (isAr ? "ليلي" : "Dark")}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* App Sections */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="layers" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {isAr ? "أقسام التطبيق" : "App Sections"}
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                {isAr ? "إظهار أو إخفاء أقسام من القائمة" : "Show or hide sections from the menu"}
              </Text>
            </View>
          </View>
          <View style={{ padding: 12, gap: 0 }}>
            {[
              { key: "showClients" as const, value: showClients, labelAr: "الزبائن", labelEn: "Clients" },
              { key: "showTrips" as const, value: showTrips, labelAr: "الرحلات", labelEn: "Trips" },
              { key: "showStudios" as const, value: showStudios, labelAr: "الاستديوهات", labelEn: "Studios" },
            ].map(({ key, value, labelAr, labelEn }, idx, arr) => (
              <View
                key={key}
                style={[
                  styles.sectionToggleRow,
                  { borderBottomColor: colors.border },
                  idx === arr.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {isAr ? labelAr : labelEn}
                </Text>
                <Switch
                  value={value}
                  onValueChange={(v) => updateSettings({ [key]: v })}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        </View>

        {/* Exchange Rate Mode */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
            <Feather name="refresh-cw" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {isAr ? "أسعار الصرف" : "Exchange Rates"}
            </Text>
          </View>
          <View style={styles.segRow}>
            {(["auto", "manual"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => updateSettings({ exchangeRateMode: mode })}
                style={[
                  styles.segBtn,
                  { borderColor: colors.border },
                  exchangeRateMode === mode && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                {exchangeRateMode === mode && <Feather name="check" size={13} color="#fff" />}
                <Text style={[styles.segText, { color: exchangeRateMode === mode ? "#fff" : colors.mutedForeground }]}>
                  {mode === "auto" ? (isAr ? "تلقائي" : "Automatic") : (isAr ? "يدوي" : "Manual")}
                </Text>
              </Pressable>
            ))}
          </View>

          {exchangeRateMode === "manual" && (
            <View style={{ padding: 12, gap: 10 }}>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                {isAr
                  ? `أدخل قيمة 1 ${primaryCurrency} مقابل كل عملة`
                  : `Enter how much 1 ${primaryCurrency} equals in each currency`}
              </Text>
              {rateInputCurrencies.length === 0 && (
                <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground, textAlign: "center" }]}>
                  {isAr ? "أضف عملات أخرى غير العملة الأساسية" : "Add currencies other than your primary"}
                </Text>
              )}
              {rateInputCurrencies.map((code) => (
                <View key={code} style={styles.rateRow}>
                  <Text style={[styles.rateLabel, { color: colors.foreground }]}>1 {primaryCurrency} =</Text>
                  <TextInput
                    style={[styles.rateInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                    value={getDisplayVal(code)}
                    onChangeText={(v) => handleRateInput(code, v)}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    textAlign="right"
                  />
                  <Text style={[styles.rateLabel, { color: colors.foreground }]}>{code}</Text>
                </View>
              ))}
              {rateInputCurrencies.length > 0 && (
                <Pressable style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveRates}>
                  <Text style={styles.saveBtnText}>{isAr ? "حفظ الأسعار" : "Save Rates"}</Text>
                </Pressable>
              )}
            </View>
          )}
          {exchangeRateMode === "auto" && (
            <Text style={[styles.autoNote, { color: colors.mutedForeground }]}>
              {isAr ? "يتم جلب الأسعار تلقائياً من الإنترنت" : "Rates are fetched automatically"}
            </Text>
          )}
        </View>

        {/* Sign Out */}
        <Pressable
          style={[styles.signOutBtn, { backgroundColor: colors.card, borderColor: "#fecaca" }]}
          onPress={() => {
            Alert.alert(
              isAr ? "تسجيل الخروج" : "Sign Out",
              isAr ? "هل أنت متأكد من تسجيل الخروج؟" : "Are you sure you want to sign out?",
              [
                { text: isAr ? "إلغاء" : "Cancel", style: "cancel" },
                {
                  text: isAr ? "خروج" : "Sign Out",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await signOut();
                      router.replace("/");
                    } catch {
                      Alert.alert(
                        isAr ? "خطأ" : "Error",
                        isAr ? "فشل تسجيل الخروج، حاول مرة أخرى" : "Sign out failed, please try again"
                      );
                    }
                  },
                },
              ]
            );
          }}
        >
          <Feather name="log-out" size={18} color="#ef4444" />
          <Text style={styles.signOutText}>
            {isAr ? "تسجيل الخروج" : "Sign Out"}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingBottom: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  section: { borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 14, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  sectionSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  sectionToggleRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segRow: { flexDirection: "row", gap: 8, padding: 12 },
  segBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 5,
  },
  segText: { fontSize: 13, fontWeight: "500" as const, fontFamily: "Inter_500Medium" },
  currencyRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1,
  },
  currencyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  currencyBadgeText: { fontSize: 11, fontWeight: "700" as const, fontFamily: "Inter_700Bold" },
  currencyName: { fontSize: 13, fontFamily: "Inter_400Regular" },
  addCurrencyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderWidth: 2, borderStyle: "dashed", borderRadius: 10, paddingVertical: 10,
  },
  addCurrencyText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  currencyPicker: { borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  currencyPickerItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1,
  },
  noMore: { textAlign: "center", fontSize: 12, padding: 12, fontFamily: "Inter_400Regular" },
  primaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  rateRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rateLabel: { fontSize: 13, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold", width: 56 },
  rateInput: {
    flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 15, fontFamily: "Inter_400Regular",
  },
  saveBtn: { borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" as const, fontFamily: "Inter_600SemiBold" },
  autoNote: { textAlign: "center", fontSize: 12, fontFamily: "Inter_400Regular", paddingHorizontal: 14, paddingBottom: 12 },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 14,
    marginTop: 8,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
    color: "#ef4444",
  },
});
