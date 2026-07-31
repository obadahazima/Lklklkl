import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAiQuery } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { Mic, MicOff, Send, Bot, User, Loader2, Trash2, AlertCircle, MessageCircle, FileBarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";

export type ExecutedAction = { name: string; success: boolean; result: Record<string, unknown> };

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  actions?: ExecutedAction[];
};

const QUICK_QUESTIONS_AR = [
  "كم رصيدي الإجمالي؟",
  "مين متأخر بالدفع؟",
  "اعملي تقرير عن هاد الشهر",
  "من أكبر مدين عندي؟",
  "ما أرباح آخر رحلة؟",
  "كم معاملة معلّقة؟",
  "ما مصاريف الاستديو؟",
  "لخّص وضعي المالي",
];

const QUICK_QUESTIONS_EN = [
  "What's my total balance?",
  "Who's overdue on payments?",
  "Generate a report for this month",
  "Who owes me the most?",
  "What's the last trip's profit?",
  "How many pending transactions?",
  "What are the studio expenses?",
  "Summarize my finances",
];

export default function Chat() {
  const { settings } = useSettings();
  const { language } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const INITIAL_MESSAGE: Message = {
    id: 0,
    role: "assistant",
    content: t("chatWelcome"),
  };

  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [summary, setSummary] = useState<{ totalTx: number; pendingCount: number; balances: Record<string, number> } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const QUICK_QUESTIONS = language === "ar" ? QUICK_QUESTIONS_AR : QUICK_QUESTIONS_EN;

  // Load the real, persistent conversation from the server on mount — this is what lets the
  // person see and continue past conversations instead of losing them on every reload.
  useEffect(() => {
    let cancelled = false;
    customFetch<{ messages: { id: number; role: "user" | "model"; content: string }[] }>("/ai/history")
      .then((res) => {
        if (cancelled || res.messages.length === 0) return;
        setMessages([
          INITIAL_MESSAGE,
          ...res.messages.map((m) => ({
            id: m.id,
            role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
            content: m.content,
          })),
        ]);
      })
      .catch(() => {
        // Non-fatal: just start a fresh visible conversation if history can't be loaded.
      });

    // load transactions summary for quick glance
    (async () => {
      try {
        const txRes = await customFetch<any>("/api/transactions");
        const txs = Array.isArray(txRes) ? txRes : txRes.items ?? txRes;
        const totalTx = txs.length || 0;
        let pendingCount = 0;
        const balances: Record<string, number> = {};
        for (const t of txs) {
          const amt = Number(t.amount) || 0;
          balances[t.currency] = (balances[t.currency] || 0) + (t.type === "income" || t.type === "receipt" ? amt : -amt);
          if (t.status === "pending") pendingCount++;
        }
        if (!cancelled) setSummary({ totalTx, pendingCount, balances });
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryMutation = useAiQuery({
    mutation: {
      onSuccess: (data) => {
        const actions = (data.data as { actions?: ExecutedAction[] } | undefined)?.actions;
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: "assistant", content: data.answer, actions },
        ]);
        // If the assistant added/edited/deleted a transaction, refresh all cached data
        // (transactions list, dashboard, client balances, etc.) so the UI reflects it immediately.
        const actionsPerformed = (data.data as { actionsPerformed?: boolean } | undefined)?.actionsPerformed;
        if (actionsPerformed) {
          queryClient.invalidateQueries();
        }
      },
      onError: (err: unknown) => {
        const apiErr = err as { status?: number; data?: { message?: string } };
        const content =
          apiErr?.status === 429
            ? `⏳ ${apiErr.data?.message ?? (language === "ar" ? "انتهت حصة الذكاء الاصطناعي اليومية، تُجدَّد غداً" : "Daily AI quota reached, resets tomorrow")}`
            : language === "ar"
            ? "عذراً، حدث خطأ في الاتصال بالذكاء الاصطناعي."
            : "Sorry, there was an error connecting to the AI.";
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: "assistant", content },
        ]);
      },
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(text: string) {
    if (!text.trim() || queryMutation.isPending) return;
    const userMsg: Message = { id: Date.now(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    // History is now tracked server-side (persisted per user) — we only send the new
    // question, and the server appends it to the real stored conversation itself.
    queryMutation.mutate({ data: { question: text } });
    setInput("");
  }

  function clearHistory() {
    setMessages([INITIAL_MESSAGE]);
    customFetch("/ai/history", { method: "DELETE" }).catch(() => {
      // Non-fatal — the visible chat is already cleared locally either way.
    });
  }

  function toggleVoiceRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    type SpeechRecognitionCtor = new () => SpeechRecognition;
    const w = window as Window & {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      toast({
        title: t("unsupported"),
        description: t("voiceNotSupported"),
        variant: "destructive",
      });
      return;
    }
    const recognition = new Ctor();
    recognition.lang = language === "ar" ? "ar-AE" : "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript.trim()) setInput(transcript.trim());
    };
    recognition.onerror = () => {
      setIsRecording(false);
      toast({ title: t("voiceError"), variant: "destructive" });
    };
    recognition.start();
    recognitionRef.current = recognition;
  }

  const conversationCount = messages.filter((m) => m.id !== 0).length;

  return (
    <div className={cn("flex flex-col h-full max-w-2xl mx-auto", language === "ar" ? "text-right" : "text-left")}>
      {/* Header */}
      <div className="assistant-header assistant-hero assistant-card shrink-0">
        <div className="flex items-center justify-between w-full px-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white">{t("aiAssistantTitle")}</h1>
              <p className="text-xs text-white/90 font-medium">
                Gemini 2.5 Flash
                {conversationCount > 0 && (
                  <span className="text-white/80 ms-2">
                    · {Math.floor(conversationCount / 2)} {t("questionsCount")}
                  </span>
                )}
              </p>
            </div>
          </div>
          {conversationCount > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 text-xs text-white/90 transition-colors px-2 py-1.5 rounded-lg hover:bg-white/10"
              title={t("clearChat")}
            >
              <Trash2 className="w-3.5 h-3.5 text-white" />
              <span className="ms-1">{t("clearChat")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Summary banner: quick financial snapshot */}
        {summary && (
          <div className="assistant-summary-card mb-3 px-3 py-2 rounded-lg bg-gradient-to-r from-[var(--hero-from)] via-[var(--hero-via)] to-[var(--hero-to)] text-white">
            <div className="flex items-center justify-between text-sm">
              <div>Transactions: <strong>{summary.totalTx}</strong></div>
              <div>Pending: <strong>{summary.pendingCount}</strong></div>
            </div>
            <div className="flex gap-3 mt-2 text-xs">
              {Object.entries(summary.balances).map(([cur, val]) => (
                <div key={cur} className="px-2 py-1 bg-white/10 rounded-md">
                  {cur} <strong>{val.toFixed(2)}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex gap-3",
              msg.role === "user" ? "flex-row-reverse" : "flex-row",
            )}
            data-testid={`msg-${msg.id}`}
          >
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                msg.role === "assistant" ? "bg-primary/10" : "bg-muted",
              )}
            >
              {msg.role === "assistant" ? (
                <Bot className="w-4 h-4 text-primary" />
              ) : (
                <User className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2 max-w-[80%]">
              <div
                className={cn(
                  "px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "assistant"
                    ? "bg-card border border-border text-foreground rounded-tr-sm"
                    : "bg-primary text-primary-foreground rounded-tl-sm",
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
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-card border border-border px-4 py-3 rounded-2xl rounded-tr-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              <span className="text-xs text-muted-foreground">{t("analyzingData")}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions (add transaction, report, overdue) */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0">
        <button
          onClick={() => {
            const tpl = language === "ar" ? "اضف مصروف 450 تصوير لعرس سارة" : "Add expense 450 photography for Sarah's wedding";
            setInput(tpl);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="shrink-0 text-xs bg-accent text-accent-foreground px-3 py-1.5 rounded-full border border-border hover:bg-primary/10 transition-colors"
          data-testid="quick-action-add-tx"
        >
          {language === "ar" ? "أضف معاملة" : "Add transaction"}
        </button>
        <button
          onClick={() => sendMessage(language === "ar" ? "اعملي تقرير عن هاد الشهر" : "Generate a report for this month")}
          className="shrink-0 text-xs bg-accent text-accent-foreground px-3 py-1.5 rounded-full border border-border hover:bg-primary/10 transition-colors"
          data-testid="quick-action-report"
        >
          {language === "ar" ? "تقرير" : "Report"}
        </button>
        <button
          onClick={() => sendMessage(language === "ar" ? "مين متأخر بالدفع؟" : "Who's overdue on payments?")}
          className="shrink-0 text-xs bg-accent text-accent-foreground px-3 py-1.5 rounded-full border border-border hover:bg-primary/10 transition-colors"
          data-testid="quick-action-overdue"
        >
          {language === "ar" ? "المتأخرون" : "Who's overdue"}
        </button>
      </div>

      {/* Quick questions */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => sendMessage(q)}
            disabled={queryMutation.isPending}
            className="shrink-0 text-xs bg-accent text-accent-foreground px-3 py-1.5 rounded-full border border-border hover:bg-primary/10 transition-colors disabled:opacity-50"
            data-testid={`quick-q-${q}`}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleVoiceRecording}
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0",
              isRecording
                ? "bg-red-500 animate-pulse"
                : "bg-muted hover:bg-muted/80",
            )}
            data-testid="btn-voice-chat"
          >
            {isRecording ? (
              <MicOff className="w-4 h-4 text-white" />
            ) : (
              <Mic className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
          <input
            ref={(el) => (inputRef.current = el)}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && sendMessage(input)
            }
            placeholder={t("chatPlaceholder")}
            className="flex-1 border border-border rounded-xl px-4 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="input-chat"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || queryMutation.isPending}
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 shrink-0"
            data-testid="btn-send-chat"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActionCards({
  actions,
  language,
  onAsk,
}: {
  actions: ExecutedAction[];
  language: "ar" | "en";
  onAsk: (text: string) => void;
}) {
  return (
    <>
      {actions.map((action, i) => {
        if (!action.success) return null;

        if (action.name === "get_overdue_clients") {
          const clients = (action.result.overdueClients as Array<{
            clientId: number;
            clientName: string;
            phone: string | null;
            daysOverdue: number;
            amounts: Record<string, number>;
          }>) ?? [];
          if (clients.length === 0) return null;
          return (
            <div key={i} className="flex flex-col gap-2">
              {clients.map((c) => (
                <div
                  key={c.clientId}
                  className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {language === "ar"
                          ? `متأخر ${c.daysOverdue} يوم`
                          : `${c.daysOverdue} days overdue`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      onAsk(
                        language === "ar"
                          ? `جهزلي تذكير واتساب لـ ${c.clientName}`
                          : `Prepare a whatsapp reminder for ${c.clientName}`,
                      )
                    }
                    className="shrink-0 text-xs bg-accent text-accent-foreground px-2.5 py-1.5 rounded-lg border border-border hover:bg-primary/10 transition-colors"
                  >
                    {language === "ar" ? "جهّز تذكير" : "Prepare reminder"}
                  </button>
                </div>
              ))}
            </div>
          );
        }

        if (action.name === "prepare_whatsapp_reminder") {
          const link = action.result.whatsappLink as string | undefined;
          const clientName = action.result.clientName as string | undefined;
          if (!link) return null;
          return (
            <a
              key={i}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5 hover:bg-primary/5 transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-sm">
                {language === "ar"
                  ? `افتح واتساب وابعث التذكير لـ ${clientName}`
                  : `Open WhatsApp and send reminder to ${clientName}`}
              </span>
            </a>
          );
        }

        if (action.name === "generate_report") {
          const totals = (action.result.totals as Array<{
            currency: string;
            income: number;
            expense: number;
            net: number;
          }>) ?? [];
          if (totals.length === 0) return null;
          return (
            <div key={i} className="bg-card border border-border rounded-xl px-3 py-3">
              <div className="flex items-center gap-2 mb-2">
                <FileBarChart className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-medium">{language === "ar" ? "التقرير المالي" : "Financial report"}</p>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {totals.map((t) => (
                  <div key={t.currency} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t.currency}</span>
                    <span>
                      {language === "ar" ? "دخل" : "In"} {t.income.toFixed(0)} ·{" "}
                      {language === "ar" ? "مصروف" : "Out"} {t.expense.toFixed(0)} ·{" "}
                      <span className={cn("font-medium", t.net >= 0 ? "text-green-600" : "text-red-500")}>
                        {language === "ar" ? "صافي" : "Net"} {t.net.toFixed(0)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return null;
      })}
    </>
  );
}