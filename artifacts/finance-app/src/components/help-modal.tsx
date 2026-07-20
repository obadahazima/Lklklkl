import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mic,
  Users,
  Route,
  Building2,
  MessageCircle,
  Settings,
  Wallet,
  Sparkles,
} from "lucide-react";

type Language = "ar" | "en";

const CONTENT: Record<
  Language,
  {
    title: string;
    intro: string;
    sections: { icon: typeof Mic; title: string; body: string }[];
    settingsTitle: string;
    settingsBody: string;
    footer: string;
  }
> = {
  ar: {
    title: "مرحباً بك 👋 دليل استخدام التطبيق",
    intro:
      "هاد التطبيق بيساعدك تتابع مصاريفك ومداخيلك بس تحكيلها صوتياً أو كتابياً، وهو بيفهم عالتلقائي الزبون، العملة، وحتى التاريخ.",
    sections: [
      {
        icon: Mic,
        title: "إضافة معاملة صوتياً",
        body:
          "بس اضغط زر المايك وقول الجملة متلما بتحكي عادةً، متلاً: \"دفعت ٥٠٠ درهم لأحمد أمس\". التطبيق بيحلل الجملة وبيستخرج النوع، المبلغ، العملة، الزبون، وحتى التاريخ إذا كان مذكوراً — وإذا ما انذكر تاريخ، بيستخدم تلقائياً تاريخ اليوم.",
      },
      {
        icon: Wallet,
        title: "أنواع المعاملات",
        body:
          "دخل ومصروف عامّين (بدون شخص محدد)، وقبض ودفع مرتبطين بزبون معيّن. التطبيق بيحدد النوع المناسب تلقائياً حسب الجملة.",
      },
      {
        icon: Users,
        title: "الزبائن",
        body:
          "كل زبون إله رصيد تلقائي (له/عليه) بيتحسب من كل معاملاته، وبيظهر جنب اسمه بالعملة الرئيسية يلي حددتها بالإعدادات.",
      },
      {
        icon: Route,
        title: "الرحلات والاستوديوهات",
        body:
          "إذا فعّلتها بالإعدادات، فيك تربط المعاملات برحلة أو استوديو معيّن لتتبع أرباح ومصاريف كل واحد لحاله.",
      },
      {
        icon: MessageCircle,
        title: "المساعد الذكي (الدردشة)",
        body:
          "اسأل أي سؤال مالي بلغتك العادية متلاً \"قديش الزبون فلان عليه؟\" أو \"شو أرباح رحلة كذا؟\" وبيجاوبك بالأرقام الفعلية من بياناتك.",
      },
      {
        icon: Sparkles,
        title: "أسعار الصرف",
        body:
          "التطبيق بيحوّل كل شي تلقائياً للعملة الرئيسية عندك، وفيك تخليه ياخد سعر الصرف تلقائياً أو تحطه يدوياً من الإعدادات.",
      },
    ],
    settingsTitle: "⚙️ الإعدادات",
    settingsBody:
      "من صفحة الإعدادات فيك تغيّر اللغة، العملة الرئيسية، العملات المفعّلة، سعر الصرف (تلقائي/يدوي)، وتظهر/تخفي أقسام الزبائن والرحلات والاستوديوهات حسب احتياجك.",
    footer: "فيك ترجع لهالدليل بأي وقت من زر (؟) بالأعلى.",
  },
  en: {
    title: "Welcome 👋 App Guide",
    intro:
      "This app helps you track your income and expenses just by talking or typing naturally — it automatically understands the client, currency, and even the date.",
    sections: [
      {
        icon: Mic,
        title: "Add a transaction by voice",
        body:
          "Just tap the mic button and say a sentence naturally, e.g. \"Paid 500 AED to Ahmad yesterday.\" The app extracts the type, amount, currency, client, and even the date if mentioned — if no date is mentioned, it defaults to today.",
      },
      {
        icon: Wallet,
        title: "Transaction types",
        body:
          "General income/expense (no specific person), and receipt/payment tied to a specific client. The app picks the right type automatically based on the sentence.",
      },
      {
        icon: Users,
        title: "Clients",
        body:
          "Each client has an automatic balance (owed to you / you owe) calculated from all their transactions, shown next to their name in your primary currency.",
      },
      {
        icon: Route,
        title: "Trips & Studios",
        body:
          "If enabled in Settings, you can link transactions to a specific trip or studio to track each one's profit and expenses separately.",
      },
      {
        icon: MessageCircle,
        title: "AI Assistant (Chat)",
        body:
          "Ask any financial question naturally, e.g. \"How much does Ahmad owe?\" or \"What's the profit on trip X?\" and get answers based on your real data.",
      },
      {
        icon: Sparkles,
        title: "Exchange rates",
        body:
          "The app automatically converts everything to your primary currency, and you can set it to fetch rates automatically or enter them manually from Settings.",
      },
    ],
    settingsTitle: "⚙️ Settings",
    settingsBody:
      "From the Settings page you can change the language, primary currency, active currencies, exchange rate mode (auto/manual), and show/hide the Clients, Trips, and Studios sections as needed.",
    footer: "You can revisit this guide anytime from the (?) button at the top.",
  },
};

export function HelpModal({
  open,
  onOpenChange,
  language,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  language: Language;
}) {
  const c = CONTENT[language];
  const dir = language === "ar" ? "rtl" : "ltr";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        className="max-w-lg max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="text-lg">{c.title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">{c.intro}</p>

        <div className="space-y-4 mt-1">
          {c.sections.map((s) => (
            <div key={s.title} className="flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <s.icon className="w-4.5 h-4.5" style={{ width: "1.1rem", height: "1.1rem" }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}

          <div className="flex gap-3 pt-2 border-t border-border">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
              <Settings className="w-4.5 h-4.5" style={{ width: "1.1rem", height: "1.1rem" }} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{c.settingsTitle}</p>
              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{c.settingsBody}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground/70 text-center pt-2">{c.footer}</p>
      </DialogContent>
    </Dialog>
  );
}