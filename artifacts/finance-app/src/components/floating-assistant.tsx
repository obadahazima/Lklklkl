import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAiQuery, customFetch } from "@workspace/api-client-react";
import { Bot, Send, Loader2, X, Maximize2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";
import { ActionCards, type ExecutedAction } from "@/pages/chat";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions?: ExecutedAction[];
};

// Floating assistant bubble — stays available on every page (except the full chat page
// itself, where it would be redundant) so the person can talk to Billy without losing
// whatever screen they're on.
export function FloatingAssistant() {
  const [location] = useLocation();
  const { settings } = useSettings();
  const { language } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: "assistant", content: t("chatWelcome") },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const queryMutation = useAiQuery({
    mutation: {
      onSuccess: (data) => {
        const actions = (data.data as { actions?: ExecutedAction[] } | undefined)?.actions;
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: "assistant", content: data.answer, actions },
        ]);
        const actionsPerformed = (data.data as { actionsPerformed?: boolean } | undefined)?.actionsPerformed;
        if (actionsPerformed) queryClient.invalidateQueries();
      },
      onError: () => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now(),
            role: "assistant",
            content:
              language === "ar"
                ? "عذراً، حدث خطأ في الاتصال بالذكاء الاصطناعي."
                : "Sorry, there was an error connecting to the AI.",
          },
        ]);
      },
    },
  });

  const STORAGE_KEY = "ai:floating:messages";

  // Load persisted conversation (server first, then localStorage fallback). Also keep local copy
  // updated so the bubble survives navigation and reloads for 24 hours.
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      // Try server history first (with a couple of retries for transient failures) — if user is
      // authenticated the server persists conversations. Only fall back to localStorage if the
      // server truly can't be reached.
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await customFetch<{ messages: { id: number; role: "user" | "model"; content: string; actions?: any }[] }>(
            "/ai/history",
          );
          if (!cancelled && res.messages && res.messages.length > 0) {
            const mapped = res.messages.map((m) => ({
              id: m.id,
              role: m.role === "user" ? "user" : "assistant",
              content: m.content,
              actions: (m as any).actions ?? undefined,
            })) as Message[];
            setMessages(mapped.length ? mapped : [{ id: 0, role: "assistant", content: t("chatWelcome") }]);
            // persist local copy
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), messages: mapped }));
            } catch {}
            return;
          }
          break; // succeeded but genuinely empty — no need to retry or fall back
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
          // otherwise fall through to localStorage below
        }
      }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as { ts: number; messages: Message[] } | undefined;
        if (!parsed) return;
        const age = Date.now() - (parsed.ts || 0);
        const DAY = 24 * 60 * 60 * 1000;
        if (age <= DAY && parsed.messages && parsed.messages.length > 0) {
          if (!cancelled) setMessages(parsed.messages);
        }
      } catch {
        // ignore
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    // persist messages locally on change
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), messages }));
    } catch {}
  }, [messages, open]);

  // Clear both server and local conversation
  async function clearHistory() {
    setMessages([{ id: 0, role: "assistant", content: t("chatWelcome") }]);
    try {
      await customFetch("/ai/history", { method: "DELETE" });
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  // Never show the bubble on the full chat page itself — that page already is the assistant.
  if (location.startsWith("/chat")) return null;

  function sendMessage(text: string) {
    if (!text.trim() || queryMutation.isPending) return;
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: text }]);
    queryMutation.mutate({ data: { question: text } });
    setInput("");
  }

  return (
    <div className={cn("fixed z-50 bottom-5", language === "ar" ? "left-5" : "right-5")}>
      {open && (
        <div
          className={cn(
            "absolute bottom-16 w-[340px] max-w-[calc(100vw-2.5rem)] h-[460px] bg-card border border-border rounded-2xl shadow-xl flex flex-col overflow-hidden",
            language === "ar" ? "left-0" : "right-0",
          )}
          dir={language === "ar" ? "rtl" : "ltr"}
        >
          <div className="assistant-header assistant-hero assistant-card shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-white">{t("aiAssistantTitle")}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearHistory}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/90"
                title={language === "ar" ? "محادثة جديدة" : "New conversation"}
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
              </button>
              <Link href="/chat">
                <button
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white/90"
                  title={language === "ar" ? "فتح المحادثة الكاملة" : "Open full chat"}
                >
                  <Maximize2 className="w-3.5 h-3.5 text-white" />
                </button>
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/90"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn("flex gap-2", msg.role === "user" ? "flex-row-reverse" : "flex-row")}
              >
                <div className="flex flex-col gap-1.5 max-w-[85%]">
                  <div
                    className={cn(
                      "px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap",
                      msg.role === "assistant"
                        ? "bg-muted text-foreground rounded-tr-sm"
                        : "bg-primary text-primary-foreground rounded-tl-sm ms-auto",
                    )}
                  >
                    {msg.content}
                  </div>
                  {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                    <ActionCards actions={msg.actions} language={language} onAsk={sendMessage} />
                  )}
                </div>
              </div>
            ))}
            {queryMutation.isPending && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs">{t("analyzingData")}</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="p-2.5 border-t border-border shrink-0">
            {/* Quick action buttons */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => {
                  const tpl = language === "ar" ? "اضف مصروف 450 تصوير لعرس سارة" : "Add expense 450 photography for Sarah's wedding";
                  setInput(tpl);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className="text-xs bg-accent text-accent-foreground px-2 py-1.5 rounded-md border border-border hover:bg-primary/10"
              >
                {language === "ar" ? "أضف معاملة" : "Add"}
              </button>
              <button
                onClick={() => sendMessage(language === "ar" ? "اعملي تقرير عن هاد الشهر" : "Generate a report for this month")}
                className="text-xs bg-accent text-accent-foreground px-2 py-1.5 rounded-md border border-border hover:bg-primary/10"
              >
                {language === "ar" ? "تقرير" : "Report"}
              </button>
              <button
                onClick={() => sendMessage(language === "ar" ? "مين متأخر بالدفع؟" : "Who's overdue on payments?")}
                className="text-xs bg-accent text-accent-foreground px-2 py-1.5 rounded-md border border-border hover:bg-primary/10"
              >
                {language === "ar" ? "المتأخرون" : "Overdue"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={(el) => (inputRef.current = el)}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                placeholder={t("chatPlaceholder")}
                className="flex-1 border border-border rounded-xl px-3 py-2 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || queryMutation.isPending}
                className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        aria-label={t("aiAssistantTitle")}
      >
        {open ? <X className="w-5 h-5" /> : <Bot className="w-6 h-6" />}
      </button>
    </div>
  );
}