import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAiQuery } from "@workspace/api-client-react";
import { Bot, Send, Loader2, X, Maximize2 } from "lucide-react";
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

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

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
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-semibold">{t("aiAssistantTitle")}</span>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/chat">
                <button
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                  title={language === "ar" ? "فتح المحادثة الكاملة" : "Open full chat"}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="w-3.5 h-3.5" />
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
            <div className="flex items-center gap-2">
              <input
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