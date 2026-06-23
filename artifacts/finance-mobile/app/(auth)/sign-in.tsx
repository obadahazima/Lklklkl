import { useSSO, useSignIn } from "@clerk/expo";
import * as AuthSession from "expo-auth-session";
import { type Href, Link, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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

WebBrowser.maybeCompleteAuthSession();

const PRIMARY = "#2563eb";
const BG = "#f4f6f9";
const CARD = "#ffffff";
const FOREGROUND = "#0e1625";
const MUTED = "#788090";
const BORDER = "#dce1ec";
const DESTRUCTIVE = "#ef4444";
const RADIUS = 12;

function useWarmUpBrowser() {
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export default function SignInPage() {
  useWarmUpBrowser();

  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ssoLoading, setSsoLoading] = useState<"google" | "apple" | null>(null);
  const [mfaPending, setMfaPending] = useState(false);
  const [localError, setLocalError] = useState("");

  const isLoading = fetchStatus === "fetching";

  const handleSSOSignIn = useCallback(
    async (provider: "oauth_google" | "oauth_apple") => {
      try {
        setSsoLoading(provider === "oauth_google" ? "google" : "apple");
        setLocalError("");
        const { createdSessionId, setActive } = await startSSOFlow({
          strategy: provider,
          redirectUrl: AuthSession.makeRedirectUri(),
        });
        if (createdSessionId && setActive) {
          await setActive({
            session: createdSessionId,
            navigate: async ({ session, decorateUrl }) => {
              if (session?.currentTask) return;
              router.replace(decorateUrl("/") as Href);
            },
          });
        }
      } catch (err: any) {
        setLocalError(
          err?.errors?.[0]?.message ??
            (provider === "oauth_google"
              ? "فشل تسجيل الدخول بـ Google"
              : "فشل تسجيل الدخول بـ Apple")
        );
      } finally {
        setSsoLoading(null);
      }
    },
    [startSSOFlow, router]
  );

  const handleSubmit = async () => {
    setLocalError("");
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) {
      setLocalError(error.message ?? "البريد أو كلمة المرور غير صحيحة");
      return;
    }
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: async ({ session, decorateUrl }) => {
          if (session?.currentTask) return;
          router.replace(decorateUrl("/") as Href);
        },
      });
    } else if (
      signIn.status === "needs_second_factor" ||
      signIn.status === "needs_client_trust"
    ) {
      await signIn.mfa.sendEmailCode();
      setMfaPending(true);
    }
  };

  const handleVerifyMFA = async () => {
    setLocalError("");
    await signIn.mfa.verifyEmailCode({ code });
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: async ({ session, decorateUrl }) => {
          if (session?.currentTask) return;
          router.replace(decorateUrl("/") as Href);
        },
      });
    } else {
      setLocalError("رمز التحقق غير صحيح");
    }
  };

  const displayError =
    localError ||
    errors?.fields?.identifier?.message ||
    errors?.fields?.password?.message ||
    errors?.fields?.code?.message ||
    "";

  if (mfaPending) {
    return (
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 40,
            paddingBottom: insets.bottom + 20,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>التحقق من الهوية</Text>
          <Text style={styles.subtitle}>
            أدخل رمز التحقق المرسل إلى بريدك الإلكتروني
          </Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>رمز التحقق</Text>
          <TextInput
            style={styles.input}
            value={code}
            placeholder="000000"
            placeholderTextColor={MUTED}
            onChangeText={setCode}
            keyboardType="numeric"
            textAlign="center"
          />
          {displayError ? (
            <Text style={styles.error}>{displayError}</Text>
          ) : null}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (isLoading || !code) && styles.buttonDisabled,
            ]}
            onPress={handleVerifyMFA}
            disabled={isLoading || !code}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>تحقق</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.linkBtn}
            onPress={() => {
              setMfaPending(false);
              setLocalError("");
              setCode("");
            }}
          >
            <Text style={[styles.linkText, { color: MUTED }]}>رجوع</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 40,
            paddingBottom: insets.bottom + 20,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <Text style={styles.title}>تسجيل الدخول</Text>
          <Text style={styles.subtitle}>Voice Accounting AI</Text>
        </View>

        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [
              styles.ssoBtn,
              pressed && styles.buttonPressed,
              ssoLoading === "google" && styles.buttonDisabled,
            ]}
            onPress={() => handleSSOSignIn("oauth_google")}
            disabled={ssoLoading !== null}
          >
            {ssoLoading === "google" ? (
              <ActivityIndicator color={FOREGROUND} />
            ) : (
              <>
                <GoogleIcon />
                <Text style={styles.ssoBtnText}>المتابعة بـ Google</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.ssoBtn,
              styles.appleBtn,
              pressed && styles.buttonPressed,
              ssoLoading === "apple" && styles.buttonDisabled,
            ]}
            onPress={() => handleSSOSignIn("oauth_apple")}
            disabled={ssoLoading !== null}
          >
            {ssoLoading === "apple" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <AppleIcon />
                <Text style={[styles.ssoBtnText, { color: "#fff" }]}>
                  المتابعة بـ Apple
                </Text>
              </>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: BORDER }]} />
            <Text style={[styles.dividerText, { color: MUTED }]}>أو</Text>
            <View style={[styles.dividerLine, { backgroundColor: BORDER }]} />
          </View>

          <Text style={styles.label}>البريد الإلكتروني</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            value={email}
            placeholder="your@email.com"
            placeholderTextColor={MUTED}
            onChangeText={setEmail}
            keyboardType="email-address"
            textAlign="left"
          />

          <Text style={styles.label}>كلمة المرور</Text>
          <TextInput
            style={styles.input}
            value={password}
            placeholder="••••••••"
            placeholderTextColor={MUTED}
            secureTextEntry
            onChangeText={setPassword}
            textAlign="left"
          />

          {displayError ? (
            <Text style={styles.error}>{displayError}</Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              (!email || !password || isLoading) && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!email || !password || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>دخول</Text>
            )}
          </Pressable>

          <View style={styles.row}>
            <Text style={styles.muted}>ليس لديك حساب؟ </Text>
            <Link href="/(auth)/sign-up">
              <Text style={styles.linkText}>سجّل الآن</Text>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GoogleIcon() {
  return (
    <View style={styles.googleIcon}>
      <Text style={styles.googleIconText}>G</Text>
    </View>
  );
}

function AppleIcon() {
  return (
    <View style={styles.appleIcon}>
      <Text style={styles.appleIconText}></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: BG,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
    gap: 8,
  },
  logoImg: {
    width: 88,
    height: 88,
    borderRadius: 20,
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "700" as const,
    color: FOREGROUND,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  card: {
    backgroundColor: CARD,
    borderRadius: RADIUS,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  ssoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: RADIUS,
    paddingVertical: 13,
    backgroundColor: CARD,
  },
  appleBtn: {
    backgroundColor: "#000",
    borderColor: "#000",
  },
  googleIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#4285F4",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIconText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700" as const,
    fontFamily: "Inter_700Bold",
  },
  appleIcon: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  appleIconText: {
    color: "#fff",
    fontSize: 18,
    lineHeight: 22,
  },
  ssoBtnText: {
    color: FOREGROUND,
    fontSize: 15,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  label: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: FOREGROUND,
    fontFamily: "Inter_600SemiBold",
    textAlign: "right",
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: FOREGROUND,
    backgroundColor: "#f8fafc",
    fontFamily: "Inter_400Regular",
    marginBottom: 4,
  },
  button: {
    backgroundColor: PRIMARY,
    borderRadius: RADIUS,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
  error: {
    color: DESTRUCTIVE,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "right",
    paddingVertical: 2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  muted: {
    color: MUTED,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  linkText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: "600" as const,
    fontFamily: "Inter_600SemiBold",
  },
});
