import { useEffect, useRef } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { SettingsProvider } from "@/contexts/settings-context";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Transactions from "@/pages/transactions";
import NewTransaction from "@/pages/new-transaction";
import Clients from "@/pages/clients";
import ClientStatement from "@/pages/client-statement";
import Trips from "@/pages/trips";
import TripDetail from "@/pages/trip-detail";
import Studios from "@/pages/studios";
import StudioDetail from "@/pages/studio-detail";
import Chat from "@/pages/chat";
import Settings from "@/pages/settings";
import Landing from "@/pages/landing";
import { setBaseUrl } from "@workspace/api-client-react";

setBaseUrl(import.meta.env.VITE_API_URL ?? "");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
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

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.jpg`,
  },
  variables: {
    colorPrimary: "#2563eb",
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
    footerActionLink: "text-blue-600 font-semibold",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-blue-600",
    formFieldSuccessText: "text-green-600",
    alertText: "text-slate-700",
    logoBox: "flex justify-center",
    logoImage: "w-10 h-10 rounded-xl",
    socialButtonsBlockButton: "border border-slate-200 bg-white hover:bg-slate-50",
    formButtonPrimary: "bg-blue-600 hover:bg-blue-700 text-white font-semibold",
    formFieldInput: "border border-slate-200 bg-slate-50 text-slate-900 rounded-xl",
    footerAction: "bg-slate-50",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50 border border-red-200",
    otpCodeFieldInput: "border border-slate-200",
    formFieldRow: "gap-3",
    main: "gap-4",
  },
};

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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>{children}</Layout>
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
        <Layout><Dashboard /></Layout>
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
      <Route path="/studios">
        <ProtectedRoute><Studios /></ProtectedRoute>
      </Route>
      <Route path="/studios/:id">
        {(params) => <ProtectedRoute><StudioDetail /></ProtectedRoute>}
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
  const [, setLocation] = useLocation();

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
        signIn: {
          start: {
            title: "أهلاً بك في Voice Accounting AI",
            subtitle: "سجّل دخولك للوصول إلى حساباتك",
          },
        },
        signUp: {
          start: {
            title: "انضم إلى Voice Accounting AI",
            subtitle: "ابدأ بإدارة حساباتك بالذكاء الاصطناعي",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <SettingsProvider>
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
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
