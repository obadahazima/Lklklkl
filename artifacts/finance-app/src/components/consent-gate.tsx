import { useState } from "react";
import { useAuth, useClerk, useUser } from "@clerk/react";
import { useSettings } from "@/contexts/settings-context";

// Keep in sync with api-server/src/lib/legalVersion.ts. Bump when Terms/Privacy change.
export const TERMS_VERSION = "2026-10-01";
const API = "https://workspaceapi-server-production-85e3.up.railway.app";

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
  const t = T[settings.language === "en" ? "en" : "ar"];
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [done, setDone] = useState(false);

  if (!isLoaded) return null;
  const accepted = (user?.publicMetadata as { consent?: { version?: string } } | undefined)?.consent?.version === TERMS_VERSION;
  if (accepted || done) return <>{children}</>;

  const base = import.meta.env.BASE_URL;
  const accept = async () => {
    setBusy(true);
    setErr(false);
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/consent`, {
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

  return (
    <div dir={settings.language === "en" ? "ltr" : "rtl"} className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
        <h1 className="text-xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc ps-5">
          {t.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <label className="flex items-start gap-3 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>
            {t.agree}{" "}
            <a href={`${base}terms`} target="_blank" rel="noreferrer" className="text-primary underline">{t.terms}</a>{" "}
            {t.and}{" "}
            <a href={`${base}privacy`} target="_blank" rel="noreferrer" className="text-primary underline">{t.privacy}</a>
          </span>
        </label>
        {err && <p className="text-xs text-destructive">{t.error}</p>}
        <button
          onClick={accept}
          disabled={!checked || busy}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary text-primary-foreground disabled:opacity-50"
        >
          {t.accept}
        </button>
        <button onClick={() => signOut()} className="w-full text-xs text-muted-foreground hover:underline">
          {t.decline}
        </button>
      </div>
    </div>
  );
}
