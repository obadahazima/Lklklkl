import { Link } from "wouter";
import {
  Mic,
  Users,
  Shield,
  Moon,
  Sun,
  Languages,
  Sparkles,
  Brain,
  BarChart3,
  MessageCircle,
  Star,
} from "lucide-react";
import { useSettings } from "@/contexts/settings-context";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const content = {
  ar: {
    login: "دخول",
    signup: "ابدأ الآن",
    badge: "مساعد مالي ذكي، لا مجرد تطبيق تسجيل",
    heroLine1: "محاسبك الشخصي",
    heroLine2: "يعمل معك، لا بدلاً عنك",
    heroDesc:
      "سجّل معاملاتك بصوتك، وتابع مستحقاتك لدى العملاء لحظة بلحظة، واسأل بيلي أي استفسار مالي؛ فينفّذه فوراً من داخل المحادثة دون أي تعقيد.",
    ctaPrimary: "ابدأ مجاناً",
    ctaSecondary: "▶ شاهد بيلي أثناء العمل",
    trust: "بلا بطاقة ائتمان · دقيقتان للبدء",
    demoQ: "لاحظتُ أنّ ثلاثة عملاء متأخّرون بالسداد، أأرسل لهم تذكيراً؟",
    demoA: "نعم، جهّز التذكيرات",
    demoWa: "افتح واتساب وأرسل التذكير إلى استوديو النور",
    stat1: "+40%",
    stat1Label: "وقت أوفر بالمحاسبة",
    stat2: "دقيقتان",
    stat2Label: "لتسجيل أول معاملة",
    stat3: "24/7",
    stat3Label: "بيلي جاهز لمساعدتك",
    howLabel: "آلية العمل",
    howTitle: "ثلاث خطوات فقط",
    step1Title: "تحدّث أو اكتب",
    step1Desc: "بأي لغة أو لهجة",
    step2Title: "بيلي يفهم وينفّذ",
    step2Desc: "يسجّل، يربط، يحلّل",
    step3Title: "تُشاهد النتيجة",
    step3Desc: "تقارير وأرقام فورية",
    features: [
      { icon: Mic, title: "تسجيل صوتي", desc: "معاملة كاملة بجملة واحدة، بأي لهجة تتحدثها" },
      { icon: Users, title: "إدارة الزبائن", desc: "كشف حساب مفصّل ومتابعة الذمم لكل عميل" },
      { icon: Shield, title: "بيانات محمية", desc: "بياناتك خاصة بك وحدك، ولا يطّلع عليها أحد" },
    ],
    quote:
      "أصبحتُ أعرف من سدّد ومن لم يسدّد في اللحظة نفسها، ولم أعد أنسى تسجيل أي مصروف؛ بيلي يذكّرني وأنا فقط أوافق",
    quoteName: "عبادة حازم",
    quoteRole: "مصوّر، استوديوهات النور",
    finalCtaTitle: "جاهز أن يعمل بيلي معك؟",
    finalCtaDesc: "يُفتح حسابك خلال دقيقتين، بلا بطاقة ائتمان",
    finalCtaBtn: "ابدأ الآن مجاناً",
    footerLinks: "الخصوصية · الشروط",
  },
  en: {
    login: "Log in",
    signup: "Get started",
    badge: "An intelligent financial assistant, not just a logging app",
    heroLine1: "Your personal accountant",
    heroLine2: "works with you, not instead of you",
    heroDesc:
      "Record your transactions by voice, track what clients owe you instantly, and ask Billy anything — he executes it right from the chat, with no complexity.",
    ctaPrimary: "Start for free",
    ctaSecondary: "▶ See Billy in action",
    trust: "No credit card · 2 minutes to start",
    demoQ: "3 clients are overdue on payment — want me to remind them?",
    demoA: "Yes, prepare the reminders",
    demoWa: "Open WhatsApp — send reminder to Studio Al Noor",
    stat1: "+40%",
    stat1Label: "time saved on bookkeeping",
    stat2: "2 min",
    stat2Label: "to log your first entry",
    stat3: "24/7",
    stat3Label: "Billy is always ready",
    howLabel: "How it works",
    howTitle: "Just three steps",
    step1Title: "Speak or type",
    step1Desc: "Any language, any dialect",
    step2Title: "Billy understands & acts",
    step2Desc: "Logs, links, analyzes",
    step3Title: "See the result",
    step3Desc: "Instant reports & numbers",
    features: [
      { icon: Mic, title: "Voice logging", desc: "A full transaction in one sentence, in any dialect" },
      { icon: Users, title: "Client management", desc: "Detailed statements and balance tracking per client" },
      { icon: Shield, title: "Protected data", desc: "Your data is yours alone — no one else can see it" },
    ],
    quote:
      "I now know instantly who's paid and who hasn't. I never forget to log an expense — Billy reminds me and I just confirm.",
    quoteName: "Obada Hazima",
    quoteRole: "Photographer, Studio Al Noor",
    finalCtaTitle: "Ready to let Billy work with you?",
    finalCtaDesc: "Your account is ready in 2 minutes, no card needed",
    finalCtaBtn: "Start free now",
    footerLinks: "Privacy · Terms",
  },
} as const;

export default function Landing() {
  const { settings, updateSettings } = useSettings();
  const lang = settings.language;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const t = content[lang];
  const isDark = settings.theme === "dark";

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={dir}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <img src={`${basePath}/logo.png`} alt="Billy Bills AI" className="w-8 h-8 rounded-lg" />
          <span className="font-semibold text-foreground text-base">
            Billy Bills <span className="text-primary">AI</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateSettings({ language: lang === "ar" ? "en" : "ar" })}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 transition-colors"
            aria-label="toggle language"
          >
            <Languages className="w-3.5 h-3.5" />
            {lang === "ar" ? "EN" : "عربي"}
          </button>
          <button
            onClick={() => updateSettings({ theme: isDark ? "light" : "dark" })}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors"
            aria-label="toggle theme"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link href="/sign-in">
            <button className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-lg hover:bg-muted">
              {t.login}
            </button>
          </Link>
          <Link href="/sign-up">
            <button className="text-xs font-semibold bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
              {t.signup}
            </button>
          </Link>
        </div>
      </header>

      {/* Hero band — fixed dark-teal gradient regardless of light/dark mode, so the
          headline stays legibly white either way. */}
      <div
        className="px-6 pt-14 pb-12 md:pt-20 md:pb-16"
        style={{
          background:
            "linear-gradient(160deg, hsl(var(--hero-from)), hsl(var(--hero-via)) 65%, hsl(var(--hero-to)))",
        }}
      >
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3.5 py-1.5 mb-5 bg-white/10 text-emerald-50 border border-white/15">
            <Sparkles className="w-3.5 h-3.5" />
            {t.badge}
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold leading-snug mb-4 text-white">
            {t.heroLine1}
            <br />
            <span style={{ color: "hsl(var(--gold))" }}>{t.heroLine2}</span>
          </h1>
          <p className="text-sm md:text-base text-white/75 max-w-lg mx-auto mb-7 leading-8">
            {t.heroDesc}
          </p>
          <div className="flex gap-3 justify-center flex-wrap mb-3">
            <Link href="/sign-up">
              <button className="bg-white text-[hsl(var(--hero-from))] px-7 py-3 rounded-xl font-semibold text-sm shadow-lg shadow-black/20 hover:opacity-90 transition-opacity">
                {t.ctaPrimary}
              </button>
            </Link>
            <Link href="/sign-in">
              <button className="border border-white/35 text-white px-7 py-3 rounded-xl font-semibold text-sm hover:bg-white/10 transition-colors">
                {t.ctaSecondary}
              </button>
            </Link>
          </div>
          <p className="text-xs text-white/50">{t.trust}</p>
        </div>

        {/* Mini chat preview card */}
        <div className="max-w-md mx-auto mt-10">
          <div className="bg-card border border-card-border rounded-2xl p-1.5 shadow-2xl shadow-black/30">
            <div className="flex items-center gap-1.5 px-2.5 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            </div>
            <div className="px-3 pb-4 space-y-2.5">
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3 text-accent-foreground" />
                </div>
                <div className="bg-accent text-accent-foreground rounded-xl px-3 py-2 text-xs leading-relaxed">
                  {t.demoQ}
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs">{t.demoA}</div>
              </div>
              <div className="flex gap-2 items-start">
                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0">
                  <Sparkles className="w-3 h-3 text-accent-foreground" />
                </div>
                <div className="bg-muted border border-border rounded-xl px-3 py-2 text-xs flex items-center gap-1.5 text-muted-foreground">
                  <MessageCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  {t.demoWa}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div className="bg-card border-b border-border px-6 py-5">
        <div className="max-w-xl mx-auto grid grid-cols-3 gap-3 text-center">
          {[
            { value: t.stat1, label: t.stat1Label },
            { value: t.stat2, label: t.stat2Label },
            { value: t.stat3, label: t.stat3Label },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-lg md:text-xl font-semibold text-primary">{s.value}</p>
              <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="px-6 py-14">
        <p className="text-center text-xs font-semibold tracking-wide text-primary uppercase mb-2">
          {t.howLabel}
        </p>
        <h3 className="text-center text-xl font-semibold text-foreground mb-8">{t.howTitle}</h3>
        <div className="max-w-xl mx-auto grid grid-cols-3 gap-4">
          {[
            { icon: Mic, title: t.step1Title, desc: t.step1Desc, n: 1 },
            { icon: Brain, title: t.step2Title, desc: t.step2Desc, n: 2 },
            { icon: BarChart3, title: t.step3Title, desc: t.step3Desc, n: 3 },
          ].map(({ icon: Icon, title, desc, n }) => (
            <div key={title} className="text-center">
              <div className="relative w-11 h-11 mx-auto mb-2.5 rounded-2xl bg-accent border border-border flex items-center justify-center">
                <Icon className="w-4.5 h-4.5 text-primary" />
                <span className="absolute -top-1.5 -start-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {n}
                </span>
              </div>
              <p className="text-xs font-semibold text-foreground mb-0.5">{title}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Feature cards */}
      <div className="px-6 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full mx-auto">
          {t.features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-card border border-card-border rounded-2xl p-5 text-center">
              <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center mx-auto mb-3">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1 text-sm">{title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonial */}
      <div className="bg-muted/40 px-6 py-10">
        <div className="max-w-md mx-auto bg-card border border-card-border rounded-2xl p-5">
          <div className="flex gap-0.5 mb-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-3.5 h-3.5 fill-current" style={{ color: "hsl(var(--gold))" }} />
            ))}
          </div>
          <p className="text-sm text-foreground leading-8 mb-3">"{t.quote}"</p>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-[11px] font-semibold text-accent-foreground">
              {t.quoteName.slice(0, 1)}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">{t.quoteName}</p>
              <p className="text-[11px] text-muted-foreground">{t.quoteRole}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA band */}
      <div className="px-6 py-12 text-center bg-gradient-to-br from-primary to-primary/80">
        <h3 className="text-lg font-semibold text-primary-foreground mb-1.5">{t.finalCtaTitle}</h3>
        <p className="text-xs text-primary-foreground/80 mb-5">{t.finalCtaDesc}</p>
        <Link href="/sign-up">
          <button className="bg-white text-primary px-7 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity">
            {t.finalCtaBtn}
          </button>
        </Link>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">Billy Bills AI © 2026</p>
        <p className="text-[11px] text-muted-foreground">{t.footerLinks}</p>
      </div>
    </div>
  );
}