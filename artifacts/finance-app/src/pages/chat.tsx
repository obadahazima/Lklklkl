import { useState, useRef, useEffect } from "react";
import { useAiQuery } from "@workspace/api-client-react";
import type { AiHistoryItem } from "@workspace/api-client-react";
import { Mic, MicOff, Send, Bot, User, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

const QUICK_QUESTIONS_AR = [
  "كم رصيدي الإجمالي؟",
  "من أكبر مدين عندي؟",
  "ما أرباح آخر رحلة؟",
  "كم معاملة معلّقة؟",
  "ما مصاريف الاستديو؟",
  "لخّص وضعي المالي",
];

const QUICK_QUESTIONS_EN = [
  "What's my total balance?",
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
  const [input, setInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  const QUICK_QUESTIONS = language === "ar" ? QUICK_QUESTIONS_AR : QUICK_QUESTIONS_EN;

  const queryMutation = useAiQuery({
    mutation: {
      onSuccess: (data) => {
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: "assistant", content: data.answer },
        ]);
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

  function buildHistory(currentMessages: Message[]): AiHistoryItem[] {
    return currentMessages
      .filter((m) => m.id !== 0)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  function sendMessage(text: string) {
    if (!text.trim() || queryMutation.isPending) return;
    const userMsg: Message = { id: Date.now(), role: "user", content: text };
    setMessages((prev) => {
      const next = [...prev, userMsg];
      queryMutation.mutate({
        data: {
          question: text,
          history: buildHistory(prev),
        },
      });
      return next;
    });
    setInput("");
  }

  function clearHistory() {
    setMessages([INITIAL_MESSAGE]);
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
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-foreground">{t("aiAssistantTitle")}</h1>
              <p className="text-xs text-green-500 font-medium">
                Gemini 2.5 Flash
                {conversationCount > 0 && (
                  <span className="text-muted-foreground ms-2">
                    · {Math.floor(conversationCount / 2)} {t("questionsCount")}
                  </span>
                )}
              </p>
            </div>
          </div>
          {conversationCount > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
              title={t("clearChat")}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("clearChat")}
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
            <div
              className={cn(
                "max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                msg.role === "assistant"
                  ? "bg-card border border-border text-foreground rounded-tr-sm"
                  : "bg-primary text-primary-foreground rounded-tl-sm",
              )}
            >
              {msg.content}
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
