import { webLedger } from "@/lib/offline-ledger";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  Route,
  Wallet,
  MessageCircle,
  Mic,
  Menu,
  X,
  Settings,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";
import { useClerk, useUser } from "@clerk/react";
import { HelpModal } from "@/components/help-modal";
import { FloatingAssistant } from "@/components/floating-assistant";



export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { settings } = useSettings();
  const { language, showClients, showTrips } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);
  const { signOut } = useClerk();
  const { toast } = useToast();
  const { user } = useUser();

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const resize = () => setIsMobile(media.matches);
    const network = () => setOnline(navigator.onLine);
    media.addEventListener("change", resize);
    window.addEventListener("online", network); window.addEventListener("offline", network);
    return () => { media.removeEventListener("change", resize); window.removeEventListener("online", network); window.removeEventListener("offline", network); };
  }, []);
  useEffect(() => { setSidebarOpen(false); if (mainRef.current) mainRef.current.scrollTop = 0; }, [location]);
  useEffect(() => {
    if (!sidebarOpen || !isMobile) return;
    const links = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)') ?? []).filter(el => el.getClientRects().length > 0);
    links()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setSidebarOpen(false); }
      if (event.key !== "Tab") return;
      const items = links(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); menuButtonRef.current?.focus(); };
  }, [sidebarOpen, isMobile]);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const navItems = [
    { href: "/", icon: LayoutDashboard, labelKey: "dashboard" as const },
    { href: "/transactions", icon: ArrowLeftRight, labelKey: "transactions" as const },
    ...(showClients ? [{ href: "/clients", icon: Users, labelKey: "clients" as const }] : []),
    ...(showTrips ? [{ href: "/trips", icon: Route, labelKey: "trips" as const }] : []),
    { href: "/accounts", icon: Wallet, labelKey: "accounts" as const },
    { href: "/chat", icon: MessageCircle, labelKey: "chat" as const },
    { href: "/settings", icon: Settings, labelKey: "settings" as const },
  ];

  const dir = language === "ar" ? "rtl" : "ltr";

  return (
    <div className="flex h-dvh bg-background overflow-hidden" dir={dir}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:z-[100] focus:top-2 focus:start-2 focus:bg-card focus:p-3 focus:rounded-lg">{language === "ar" ? "تخطّي إلى المحتوى" : "Skip to content"}</a>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        ref={sidebarRef}
        id="app-navigation"
        aria-label={language === "ar" ? "القائمة الرئيسية" : "Main navigation"}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile && sidebarOpen ? true : undefined}
        aria-hidden={isMobile && !sidebarOpen}
        inert={isMobile && !sidebarOpen}
        className={cn(
          "fixed top-0 h-full w-64 bg-sidebar z-50 flex flex-col transition-transform duration-300 lg:relative lg:translate-x-0",
          dir === "rtl" ? "right-0" : "left-0",
          sidebarOpen
            ? "translate-x-0"
            : dir === "rtl"
            ? "translate-x-full"
            : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <img src={`${basePath}/logo-mark-white.svg`} alt="Logo" className="w-10 h-10 shrink-0" />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">
                Billy Bills AI
              </h1>
              <p className="text-sidebar-foreground/60 text-xs mt-0.5">
                {language === "ar" ? "محاسبك الذكي" : "Smart Finance"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setSidebarOpen(false); setHelpOpen(true); }}
              className="text-sidebar-foreground/60 hover:text-white p-1.5 rounded-lg hover:bg-sidebar-accent/40"
              title={language === "ar" ? "مساعدة" : "Help"}
              data-testid="btn-help"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button
              aria-label={language === "ar" ? "إغلاق القائمة" : "Close menu"}
              className="lg:hidden text-sidebar-foreground/60 hover:text-white p-2"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-4 pt-4">
          <Link href="/transactions/new" onClick={() => setSidebarOpen(false)}>
            <button
              className="w-full flex items-center gap-2 bg-sidebar-primary hover:bg-sidebar-primary/90 text-sidebar-primary-foreground rounded-xl px-4 py-3 text-sm font-semibold transition-colors"
              data-testid="btn-new-transaction"
            >
              <Mic className="w-5 h-5" />
              {language === "ar" ? "سجّل معاملتك بصوتك" : "Record a transaction"}
            </button>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, icon: Icon, labelKey }) => {
            const isActive = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={isActive ? "page" : undefined} onClick={() => setSidebarOpen(false)}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer",
                    isActive
                      ? "bg-sidebar-accent text-white"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-white"
                  )}
                  data-testid={`nav-${href.replace("/", "") || "home"}`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {t(labelKey)}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border space-y-3">
          {user && (
            <div className="flex items-center gap-3 px-2">
              {user.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={user.fullName ?? ""}
                  className="w-8 h-8 rounded-full shrink-0 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-bold">
                    {(user.fullName ?? user.emailAddresses[0]?.emailAddress ?? "U").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">
                  {user.fullName ?? user.emailAddresses[0]?.emailAddress ?? ""}
                </p>
                {user.fullName && (
                  <p className="text-sidebar-foreground/50 text-[10px] truncate">
                    {user.emailAddresses[0]?.emailAddress}
                  </p>
                )}
              </div>
            </div>
          )}
          <button
            onClick={async () => { try { await webLedger.activate(null); await signOut({ redirectUrl: basePath || "/" }); } catch { toast({ title: language === "ar" ? "تعذر تسجيل الخروج، حاول مجدداً" : "Sign out failed; try again", variant: "destructive" }); } }}
            className="w-full flex items-center gap-2 text-sidebar-foreground/60 hover:text-white hover:bg-sidebar-accent/40 rounded-xl px-3 py-2 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {language === "ar" ? "تسجيل الخروج" : "Sign Out"}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-card border-b border-border shrink-0">
          <button
            ref={menuButtonRef}
            aria-label={language === "ar" ? "فتح القائمة" : "Open menu"}
            aria-expanded={sidebarOpen}
            aria-controls="app-navigation"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-muted"
            data-testid="btn-menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <img src={`${basePath}/logo-symbol-128.png`} alt="" className="w-7 h-7" />
            <h1 className="font-bold text-foreground">
              Billy Bills AI
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setSidebarOpen(false); setHelpOpen(true); }}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
              title={language === "ar" ? "مساعدة" : "Help"}
              data-testid="btn-help-mobile"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <Link href="/transactions/new">
              <button aria-label={language === "ar" ? "سجّل معاملتك بصوتك" : "Record a transaction"} className="p-2 rounded-lg bg-primary text-primary-foreground" data-testid="btn-quick-add">
                <Mic className="w-5 h-5" />
              </button>
            </Link>
          </div>
        </header>

        <nav aria-label={language === "ar" ? "التنقل السريع" : "Quick navigation"} className="lg:hidden grid grid-cols-4 bg-card border-b border-border shrink-0 p-1 gap-1">
          {navItems.filter(item => ["/", "/transactions", "/accounts"].includes(item.href)).map(({ href, icon: Icon, labelKey }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold", active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}><Icon className="w-5 h-5" /><span>{t(labelKey)}</span></Link>;
          })}
          <button onClick={() => setSidebarOpen(true)} aria-expanded={sidebarOpen} aria-controls="app-navigation" className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold", !["/", "/transactions", "/accounts"].some(href => href === "/" ? location === "/" : location.startsWith(href)) ? "bg-primary/10 text-primary" : "text-muted-foreground")}><Menu className="w-5 h-5" />{language === "ar" ? "المزيد" : "More"}</button>
        </nav>
        {!online && <div role="status" className="bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100 px-4 py-3 text-sm border-b border-amber-200 dark:border-amber-900">{language === "ar" ? "أنت بدون إنترنت. سجّل يدوياً، والمزامنة بتكمل لما يرجع الاتصال." : "You’re offline. Enter transactions manually; syncing resumes when connected."} <Link href="/offline" className="underline font-semibold">{language === "ar" ? "فتح الإدخال الأوفلاين" : "Open offline entry"}</Link></div>}

        <main ref={mainRef} id="main-content" className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} language={language} />
      {!sidebarOpen && !helpOpen && <FloatingAssistant />}
    </div>
  );
}