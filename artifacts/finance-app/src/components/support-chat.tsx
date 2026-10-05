import { useEffect, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useSettings } from "@/contexts/settings-context";

const API = "https://workspaceapi-server-production-85e3.up.railway.app";

type Msg = { role: "user" | "model"; text: string };
type Cfg = { email: string; whatsapp: string | null };

const T = {
  ar: {
    title: "الدعم",
    hello: "أهلاً! أنا مساعد الدعم. اسألني عن أي شي بخصوص التطبيق وبساعدك. لا تكتب كلمات سر أو أرقام بطاقات.",
    placeholder: "اكتب سؤالك...",
    send: "إرسال",
    thinking: "...",
    human: "تواصل مع شخص",
    humanTitle: "تواصل مع الدعم مباشرة",
    whatsapp: "واتساب",
    email: "إيميل",
    close: "إغلاق",
    error: "تعذّر الرد حالياً. تقدر تتواصل مع الدعم مباشرة:",
    tooMany: "رسائل كتير بوقت قصير، جرّب بعد شوي.",
    intro: "مرحباً، أحتاج مساعدة بتطبيق Billy Bills AI.",
  },
  en: {
    title: "Support",
    hello: "Hi! I'm the support assistant. Ask me anything about the app. Please don't share passwords or card numbers.",
    placeholder: "Type your question...",
    send: "Send",
    thinking: "...",
    human: "Talk to a person",
    humanTitle: "Contact support directly",
    whatsapp: "WhatsApp",
    email: "Email",
    close: "Close",
    error: "Couldn't reply right now. You can contact support directly:",
    tooMany: "Too many messages in a short time, please try again shortly.",
    intro: "Hello, I need help with Billy Bills AI.",
  },
} as const;

export function SupportChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { settings } = useSettings();
  const lang = settings.language === "en" ? "en" : "ar";
  const t = T[lang];
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHuman, setShowHuman] = useState(false);
  const [note, setNote] = useState("");
  const [cfg, setCfg] = useState<Cfg>({ email: "onhazima@gmail.com", whatsapp: null });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const token = await getToken();
        const r = await fetch(`${API}/api/support/config`, { headers: { Authorization: `Bearer ${token}` } });
        if (r.ok) setCfg(await r.json());
      } catch {}
    })();
  }, [open, getToken]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy, showHuman]);

  if (!open) return null;

  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.text ?? "";
  const who = user?.primaryEmailAddress?.emailAddress ?? "";
  const body = `${t.intro}\n${who ? `Account: ${who}\n` : ""}${lastUser ? `Issue: ${lastUser}` : ""}`;
  const waUrl = cfg.whatsapp ? `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(body)}` : null;
  const mailUrl = `mailto:${cfg.email}?subject=${encodeURIComponent("Billy Bills AI support")}&body=${encodeURIComponent(body)}`;

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setNote("");
    try {
      const token = await getToken();
      const res = await fetch(`${API}/api/support/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (res.status === 429) {
        setNote(t.tooMany);
      } else if (!res.ok) {
        throw new Error("failed");
      } else {
        const data = (await res.json()) as { reply: string; needsHuman: boolean };
        if (data.reply) setMsgs([...next, { role: "model", text: data.reply }]);
        if (data.needsHuman) setShowHuman(true);
      }
    } catch {
      setNote(t.error);
      setShowHuman(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        dir={lang === "ar" ? "rtl" : "ltr"}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md h-[85vh] sm:h-[600px] bg-card border border-border rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-semibold">{t.title}</h2>
          <div className="flex items-center gap-3 text-xs">
            <button onClick={() => setShowHuman(true)} className="text-primary hover:underline">{t.human}</button>
            <button onClick={onClose} className="text-muted-foreground hover:underline">{t.close}</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <div className="bg-muted rounded-xl px-3 py-2 max-w-[85%]">{t.hello}</div>
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
              <div className={`rounded-xl px-3 py-2 max-w-[85%] whitespace-pre-wrap ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {m.text}
              </div>
            </div>
          ))}
          {busy && <div className="bg-muted rounded-xl px-3 py-2 w-fit">{t.thinking}</div>}
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          {showHuman && (
            <div className="border border-primary/30 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium">{t.humanTitle}</p>
              <div className="flex gap-2">
                {waUrl && (
                  <a href={waUrl} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                    {t.whatsapp}
                  </a>
                )}
                <a href={mailUrl} className="flex-1 text-center py-2 rounded-lg border border-border text-xs font-semibold">
                  {t.email}
                </a>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <div className="p-3 border-t border-border flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            maxLength={1000}
            placeholder={t.placeholder}
            className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button onClick={send} disabled={busy || !input.trim()} className="px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {t.send}
          </button>
        </div>
      </div>
    </div>
  );
}
