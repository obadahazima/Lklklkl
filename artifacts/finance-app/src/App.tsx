import { AppErrorBoundary } from "@/components/app-error-boundary";
import { OfflineSyncBridge } from "@/components/offline-ledger";
import { OfflineEntry } from "@/components/offline-entry";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { ConsentGate } from "@/components/consent-gate";
import { SettingsProvider, loadLocalSettings } from "@/contexts/settings-context";
import NotFound from "@/pages/not-found";
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Transactions = lazy(() => import("@/pages/transactions"));
const NewTransaction = lazy(() => import("@/pages/new-transaction"));
const Clients = lazy(() => import("@/pages/clients"));
const ClientStatement = lazy(() => import("@/pages/client-statement"));
const Trips = lazy(() => import("@/pages/trips"));
const TripDetail = lazy(() => import("@/pages/trip-detail"));
const Accounts = lazy(() => import("@/pages/accounts"));
import Chat from "@/pages/chat";
const Settings = lazy(() => import("@/pages/settings"));
import Landing from "@/pages/landing";
import { PrivacyPage, TermsPage, DeleteAccountPage } from "@/pages/legal";

setBaseUrl("https://workspaceapi-server-production-85e3.up.railway.app");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { onError: () => toast({ title: document.documentElement.lang === "ar" ? "ما تم حفظ التغيير، حاول مجدداً" : "Change not saved. Please try again.", variant: "destructive" }) },
  },
});

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}


const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo-symbol-128.png`,
  },
  variables: {
    colorPrimary: "#216047",
    colorForeground: "#0f172a",
    colorMutedForeground: "#64748b",
    colorDanger: "#ef4444",
    colorBackground: "#ffffff",
    colorInput: "#f8fafc",
    colorInputForeground: "#0f172a",
    colorNeutral: "#e2e8f0",
    fontFamily: "Inter, Noto Sans Arabic, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-lg border border-slate-200",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 font-bold",
    headerSubtitle: "text-slate-500",
    socialButtonsBlockButtonText: "text-slate-700 font-medium",
    formFieldLabel: "text-slate-700 font-medium",
    footerActionLink: "text-primary font-semibold",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-green-600",
    alertText: "text-slate-700",
    logoBox: "flex justify-center",
    logoImage: "w-10 h-10 rounded-xl",
    socialButtonsBlockButton: "border border-slate-200 bg-white hover:bg-slate-50",
    formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground font-semibold",
    formFieldInput: "border border-slate-200 bg-slate-50 text-slate-900 rounded-xl",
    footerAction: "bg-slate-50",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border border-red-200",
    otpCodeFieldInput: "border border-slate-200",
    formFieldRow: "gap-3",
    main: "gap-4",
  },
};

function AuthTokenSetter() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
        fallbackRedirectUrl={basePath || "/"}
        appearance={{
          elements: {
            formField__phoneNumber: "!hidden",
          },
        }}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        fallbackRedirectUrl={basePath || "/"}
        appearance={{
          elements: {
            formField__phoneNumber: "!hidden",
          },
        }}
      />
    </div>
  );
}

function PageLoading() {
  return <div role="status" className="max-w-2xl mx-auto p-6 space-y-4"><p className="text-sm text-muted-foreground">{document.documentElement.lang === "ar" ? "عم نجهّز الصفحة…" : "Loading your page…"}</p><div className="h-8 w-1/2 animate-pulse rounded-lg bg-muted" /><div className="h-40 animate-pulse rounded-2xl bg-muted" /></div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <ConsentGate><Layout><Suspense fallback={<PageLoading />}>{children}</Suspense></Layout></ConsentGate>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <ConsentGate><Layout><Suspense fallback={<PageLoading />}><Dashboard /></Suspense></Layout></ConsentGate>
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={HomeRoute} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/delete-account" component={DeleteAccountPage} />
      <Route path="/transactions">
        <ProtectedRoute><Transactions /></ProtectedRoute>
      </Route>
      <Route path="/transactions/new">
        <ProtectedRoute><NewTransaction /></ProtectedRoute>
      </Route>
      <Route path="/clients">
        <ProtectedRoute><Clients /></ProtectedRoute>
      </Route>
      <Route path="/clients/:id">
        {(params) => <ProtectedRoute><ClientStatement /></ProtectedRoute>}
      </Route>
      <Route path="/trips">
        <ProtectedRoute><Trips /></ProtectedRoute>
      </Route>
      <Route path="/trips/:id">
        {(params) => <ProtectedRoute><TripDetail /></ProtectedRoute>}
      </Route>
      <Route path="/accounts">
        <ProtectedRoute><Accounts /></ProtectedRoute>
      </Route>
      <Route path="/chat">
        <ProtectedRoute><Chat /></ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute><Settings /></ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
  const [, setLocation] = useLocation();
  const authAr = loadLocalSettings().language === "ar";

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={basePath || "/"}
      signUpFallbackRedirectUrl={basePath || "/"}
      localization={{
        locale: authAr ? "ar" : "en-US",
        socialButtonsBlockButton: authAr ? "المتابعة باستخدام {{provider|titleize}}" : "Continue with {{provider|titleize}}",
        dividerText: authAr ? "أو" : "or",
        formFieldLabel__emailAddress: authAr ? "البريد الإلكتروني" : "Email address",
        formFieldLabel__password: authAr ? "كلمة المرور" : "Password",
        formFieldInputPlaceholder__emailAddress: authAr ? "أدخل بريدك الإلكتروني" : "Enter your email address",
        formFieldInputPlaceholder__password: authAr ? "أدخل كلمة المرور" : "Enter your password",
        formFieldAction__forgotPassword: authAr ? "نسيت كلمة المرور؟" : "Forgot password?",
        formButtonPrimary: authAr ? "متابعة" : "Continue",
        signIn: {
          start: {
            title: authAr ? "أهلاً بك في Billy Bills AI" : "Welcome to Billy Bills AI",
            actionText: authAr ? "ما عندك حساب؟" : "Don’t have an account?",
            actionLink: authAr ? "إنشاء حساب" : "Sign up",
            subtitle: authAr ? "سجّل دخولك للوصول إلى حساباتك" : "Sign in to access your accounts",
          },
        },
        signUp: {
          start: {
            title: authAr ? "انضم إلى Billy Bills AI" : "Join Billy Bills AI",
            actionText: authAr ? "عندك حساب؟" : "Already have an account?",
            actionLink: authAr ? "تسجيل الدخول" : "Sign in",
            subtitle: authAr ? "ابدأ بإدارة حساباتك بالذكاء الاصطناعي" : "Start managing your finances with AI",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
          <AuthTokenSetter />
          <OfflineSyncBridge />
          <ClerkQueryClientCacheInvalidator />
          <TooltipProvider>
            <AppRoutes />
            <Toaster />
          </TooltipProvider>
        </SettingsProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  // Cold offline start must not wait for Clerk's network-loaded resources. This local-only
  // form can queue entries but cannot send them until normal authentication resumes.
  const [offlineBoot, setOfflineBoot] = useState(() => !navigator.onLine);
  useEffect(() => {
    const connected = () => setOfflineBoot(false);
    window.addEventListener("online", connected);
    return () => window.removeEventListener("online", connected);
  }, []);
  if (offlineBoot || window.location.pathname === `${basePath}/offline`) return <OfflineEntry />;
  return (
    <WouterRouter base={basePath}>
      <AppErrorBoundary><ClerkProviderWithRoutes /></AppErrorBoundary>
    </WouterRouter>
  );
}

export default App;