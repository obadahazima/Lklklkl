import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  Route,
  Building2,
  MessageCircle,
  Plus,
  Menu,
  X,
  Settings,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";
import { useClerk, useUser } from "@clerk/react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { settings } = useSettings();
  const { language, showClients, showTrips, showStudios } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);
  const { signOut } = useClerk();
  const { user } = useUser();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const navItems = [
    { href: "/", icon: LayoutDashboard, labelKey: "dashboard" as const },
    { href: "/transactions", icon: ArrowLeftRight, labelKey: "transactions" as const },
    ...(showClients ? [{ href: "/clients", icon: Users, labelKey: "clients" as const }] : []),
    ...(showTrips ? [{ href: "/trips", icon: Route, labelKey: "trips" as const }] : []),
    ...(showStudios ? [{ href: "/studios", icon: Building2, labelKey: "studios" as const }] : []),
    { href: "/chat", icon: MessageCircle, labelKey: "chat" as const },
    { href: "/settings", icon: Settings, labelKey: "settings" as const },
  ];

  const dir = language === "ar" ? "rtl" : "ltr";

  return (
    <div className="flex h-screen bg-background overflow-hidden" dir={dir}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
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
            <img src={`${basePath}/logo.jpg`} alt="Logo" className="w-10 h-10 rounded-xl shrink-0" />
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">
                {language === "ar" ? "Qayd AI" : "Qayd AI"}
              </h1>
              <p className="text-sidebar-foreground/60 text-xs mt-0.5">
                {language === "ar" ? "محاسبك الذكي" : "Smart Finance"}
              </p>
            </div>
          </div>
          <button
            className="lg:hidden text-sidebar-foreground/60 hover:text-white p-1"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pt-4">
          <Link href="/transactions/new" onClick={() => setSidebarOpen(false)}>
            <button
              className="w-full flex items-center gap-2 bg-sidebar-primary hover:bg-sidebar-primary/90 text-sidebar-primary-foreground rounded-xl px-4 py-3 text-sm font-semibold transition-colors"
              data-testid="btn-new-transaction"
            >
              <Plus className="w-4 h-4" />
              {t("newTransaction")}
            </button>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ href, icon: Icon, labelKey }) => {
            const isActive = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href} onClick={() => setSidebarOpen(false)}>
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
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
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
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-muted"
            data-testid="btn-menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-foreground">
            {language === "ar" ? "حسابات" : "Hisabat"}
          </h1>
          <Link href="/transactions/new">
            <button className="p-2 rounded-lg bg-primary text-primary-foreground" data-testid="btn-quick-add">
              <Plus className="w-4 h-4" />
            </button>
          </Link>
        </header>

        <nav className="lg:hidden flex items-center justify-around bg-card border-b border-border py-1.5 px-1 shrink-0">
          {navItems.map(({ href, icon: Icon, labelKey }) => {
            const isActive = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <div
                  className={cn(
                    "flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <Icon className="w-4.5 h-4.5" style={{ width: "1.1rem", height: "1.1rem" }} />
                  <span className="text-[9px] font-medium">{t(labelKey)}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
