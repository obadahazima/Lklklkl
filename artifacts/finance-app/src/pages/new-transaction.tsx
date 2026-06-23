import { useState, useRef } from "react";
import {
  useParseVoiceInput,
  useCreateTransaction,
  useCreateClient,
  useCreateTrip,
  useCreateStudio,
  useListClients,
  useListTrips,
  useListStudios,
  getListTransactionsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentTransactionsQueryKey,
  getListClientsQueryKey,
  getListTripsQueryKey,
  getListStudiosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Mic,
  MicOff,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  UserPlus,
  Users,
  Map,
  MapPin,
  Building2,
  PlusCircle,
} from "lucide-react";
import { cn, typeLabel, currencyClass, formatAmount } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useSettings } from "@/contexts/settings-context";
import { tr } from "@/lib/i18n";

type ParsedData = {
  type?: string | null;
  amount?: number | null;
  currency?: string | null;
  clientName?: string | null;
  clientId?: number | null;
  tripName?: string | null;
  tripId?: number | null;
  studioName?: string | null;
  studioId?: number | null;
  detectedLanguage?: string | null;
  description?: string | null;
  rawText?: string | null;
};

type ResolutionState =
  | { kind: "idle" }
  | { kind: "similar"; matches: { id: number; name: string }[]; inputName: string }
  | { kind: "new"; name: string };

type ClientResolutionState = ResolutionState;
type TripResolutionState = ResolutionState;
type StudioResolutionState = ResolutionState;

type PendingTx = {
  type: string; amount: number; currency: string;
  description: string | null; status: string; date: string;
  clientId: number | null | undefined;
  tripId: number | null | undefined;
  studioId: number | null | undefined;
};

export default function NewTransaction() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language, showClients, showTrips, showStudios } = settings;
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const [step, setStep] = useState<"input" | "confirm">("input");
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [parsed, setParsed] = useState<ParsedData | null>(null);

  const [clientResolution, setClientResolution] = useState<ClientResolutionState>({ kind: "idle" });
  const [newClientPhone, setNewClientPhone] = useState("");
  const [tripResolution, setTripResolution] = useState<TripResolutionState>({ kind: "idle" });
  const [studioResolution, setStudioResolution] = useState<StudioResolutionState>({ kind: "idle" });

  const pendingTxRef = useRef<PendingTx | null>(null);

  const [manualForm, setManualForm] = useState({
    type: "expense",
    amount: "",
    currency: settings.primaryCurrency,
    clientId: "",
    tripId: "",
    studioId: "",
    description: "",
    status: "pending",
    date: new Date().toISOString().split("T")[0],
  });

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const { data: clients } = useListClients();
  const { data: trips } = useListTrips();
  const { data: studios } = useListStudios();

  const parseMutation = useParseVoiceInput({
    mutation: {
      onSuccess: (data) => {
        if (data.success) {
          setParsed(data);
          setStep("confirm");
        } else {
          toast({ title: language === "ar" ? "لم أفهم" : "Not understood", description: data.error || (language === "ar" ? "حاولي مرة أخرى" : "Please try again"), variant: "destructive" });
        }
      },
      onError: (err: unknown) => {
        const apiErr = err as { status?: number; data?: { message?: string } };
        if (apiErr?.status === 429) {
          toast({
            title: "⏳ " + (language === "ar" ? "حصة الذكاء الاصطناعي" : "AI Quota"),
            description: apiErr.data?.message ?? (language === "ar" ? "انتهت الحصة، جربي غداً" : "Quota exceeded, try tomorrow"),
            variant: "destructive",
          });
        } else {
          toast({ title: language === "ar" ? "خطأ في التحليل" : "Analysis Error", description: language === "ar" ? "حاولي مرة أخرى" : "Please try again", variant: "destructive" });
        }
      },
    },
  });

  const createClientMutation = useCreateClient({
    mutation: {
      onSuccess: (newClient) => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        toast({ title: t("clientAdded"), description: newClient.name });
        if (pendingTxRef.current) {
          pendingTxRef.current.clientId = newClient.id;
        }
        setClientResolution({ kind: "idle" });
        setNewClientPhone("");
        advanceResolutionChain();
      },
    },
  });

  const createTripMutation = useCreateTrip({
    mutation: {
      onSuccess: (newTrip) => {
        queryClient.invalidateQueries({ queryKey: getListTripsQueryKey() });
        toast({ title: t("tripAdded"), description: newTrip.name });
        if (pendingTxRef.current) {
          pendingTxRef.current.tripId = newTrip.id;
        }
        setTripResolution({ kind: "idle" });
        advanceResolutionChain();
      },
    },
  });

  const createStudioMutation = useCreateStudio({
    mutation: {
      onSuccess: (newStudio) => {
        queryClient.invalidateQueries({ queryKey: getListStudiosQueryKey() });
        toast({ title: t("studioAdded"), description: newStudio.name });
        if (pendingTxRef.current) {
          pendingTxRef.current.studioId = newStudio.id;
        }
        setStudioResolution({ kind: "idle" });
        advanceResolutionChain();
      },
    },
  });

  const createMutation = useCreateTransaction({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentTransactionsQueryKey() });
        toast({ title: t("savedSuccess"), description: t("savedDesc") });
        setLocation("/transactions");
      },
      onError: () => {
        toast({ title: t("saveError"), description: t("saveErrorDesc"), variant: "destructive" });
      },
    },
  });

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
        title: language === "ar" ? "الصوت غير مدعوم" : "Voice not supported",
        description: language === "ar" ? "متصفحك لا يدعم التسجيل الصوتي — استخدم خانة النص أدناه" : "Your browser doesn't support voice recording — use the text field below",
        variant: "destructive",
      });
      return;
    }

    const recognition = new Ctor();
    recognition.lang = language === "ar" ? "ar-AE" : "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = true;

    let finalTranscript = "";

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => {
      setIsRecording(false);
      if (finalTranscript.trim()) {
        setTextInput(finalTranscript.trim());
        parseMutation.mutate({ data: { text: finalTranscript.trim(), currencies: settings.currencies, primaryCurrency: settings.primaryCurrency } });
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        }
      }
      setTextInput(finalTranscript.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setIsRecording(false);
      if ((event as unknown as { error: string }).error === "not-allowed") {
        toast({
          title: language === "ar" ? "إذن الميكروفون مرفوض" : "Microphone permission denied",
          description: language === "ar" ? "يرجى السماح للتطبيق باستخدام الميكروفون من إعدادات المتصفح" : "Please allow microphone access in your browser settings",
          variant: "destructive",
        });
      } else {
        toast({
          title: language === "ar" ? "خطأ في التسجيل" : "Recording error",
          description: language === "ar" ? "لم نتمكن من التسجيل — حاولي مرة أخرى" : "Could not record — please try again",
          variant: "destructive",
        });
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }

  function handleParseText() {
    if (!textInput.trim()) return;
    parseMutation.mutate({ data: { text: textInput, currencies: settings.currencies, primaryCurrency: settings.primaryCurrency } });
  }

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  function findSimilarClients(name: string): { id: number; name: string }[] {
    if (!clients || !name) return [];
    const n = norm(name);
    return clients
      .filter((c) => { const cn = norm(c.name); return cn === n || cn.includes(n) || n.includes(cn) || n.split(" ").some((w) => w.length > 1 && cn.includes(w)); })
      .map((c) => ({ id: c.id, name: c.name }));
  }

  function findSimilarTrips(name: string): { id: number; name: string }[] {
    if (!trips || !name) return [];
    const n = norm(name);
    return trips
      .filter((t) => { const tn = norm(t.name); return tn === n || tn.includes(n) || n.includes(tn) || n.split(" ").some((w) => w.length > 1 && tn.includes(w)); })
      .map((t) => ({ id: t.id, name: t.name }));
  }

  function findSimilarStudios(name: string): { id: number; name: string }[] {
    if (!studios || !name) return [];
    const n = norm(name);
    return studios
      .filter((s) => { const sn = norm(s.name); return sn === n || sn.includes(n) || n.includes(sn) || n.split(" ").some((w) => w.length > 1 && sn.includes(w)); })
      .map((s) => ({ id: s.id, name: s.name }));
  }

  function savePendingTransaction() {
    const p = pendingTxRef.current;
    if (!p) return;
    createMutation.mutate({
      data: {
        type: p.type,
        amount: p.amount,
        currency: p.currency,
        clientId: p.clientId ?? null,
        tripId: p.tripId ?? null,
        studioId: p.studioId ?? null,
        description: p.description,
        status: p.status,
        date: p.date,
      },
    });
  }

  function advanceResolutionChain() {
    const p = pendingTxRef.current;
    if (!p) return;

    // Skip hidden entity types from settings
    if (!showClients && p.clientId === undefined) p.clientId = null;
    if (!showTrips && p.tripId === undefined) p.tripId = null;
    if (!showStudios && p.studioId === undefined) p.studioId = null;

    if (p.clientId === undefined) {
      const name = parsed?.clientName?.trim();
      const aiId = parsed?.clientId;
      // Server already validated this id against the user's own clients → trust it directly (avoids duplicate-create race if list isn't loaded yet)
      if (aiId != null) { p.clientId = aiId; }
      else if (!name) { p.clientId = null; }
      else {
        const exact = clients?.find((c) => norm(c.name) === norm(name));
        if (exact) { p.clientId = exact.id; }
        else {
          const similar = findSimilarClients(name);
          if (similar.length > 0) { setClientResolution({ kind: "similar", matches: similar, inputName: name }); return; }
          else { setClientResolution({ kind: "new", name }); return; }
        }
      }
    }

    if (p.tripId === undefined) {
      const name = parsed?.tripName?.trim();
      const aiId = parsed?.tripId;
      if (aiId != null) { p.tripId = aiId; }
      else if (!name) { p.tripId = null; }
      else {
        const exact = trips?.find((t) => norm(t.name) === norm(name));
        if (exact) { p.tripId = exact.id; }
        else {
          const similar = findSimilarTrips(name);
          if (similar.length > 0) { setTripResolution({ kind: "similar", matches: similar, inputName: name }); return; }
          else { setTripResolution({ kind: "new", name }); return; }
        }
      }
    }

    if (p.studioId === undefined) {
      const name = parsed?.studioName?.trim();
      const aiId = parsed?.studioId;
      if (aiId != null) { p.studioId = aiId; }
      else if (!name) { p.studioId = null; }
      else {
        const exact = studios?.find((s) => norm(s.name) === norm(name));
        if (exact) { p.studioId = exact.id; }
        else {
          const similar = findSimilarStudios(name);
          if (similar.length > 0) { setStudioResolution({ kind: "similar", matches: similar, inputName: name }); return; }
          else { setStudioResolution({ kind: "new", name }); return; }
        }
      }
    }

    savePendingTransaction();
  }

  function handleConfirm() {
    if (!parsed) return;
    pendingTxRef.current = {
      type: parsed.type || "expense",
      amount: parsed.amount || 0,
      currency: parsed.currency || "AED",
      description: parsed.description ?? null,
      status: "pending",
      date: new Date().toISOString().split("T")[0],
      clientId: undefined,
      tripId: undefined,
      studioId: undefined,
    };
    advanceResolutionChain();
  }

  function chooseExistingClient(id: number) {
    if (!pendingTxRef.current) return;
    pendingTxRef.current.clientId = id;
    setClientResolution({ kind: "idle" });
    advanceResolutionChain();
  }

  function confirmNewClient(name: string) {
    createClientMutation.mutate({ data: { name, phone: newClientPhone || undefined } });
  }

  function skipClient() {
    if (!pendingTxRef.current) return;
    pendingTxRef.current.clientId = null;
    setClientResolution({ kind: "idle" });
    advanceResolutionChain();
  }

  function chooseExistingTrip(id: number) {
    if (!pendingTxRef.current) return;
    pendingTxRef.current.tripId = id;
    setTripResolution({ kind: "idle" });
    advanceResolutionChain();
  }

  function confirmNewTrip(name: string) {
    createTripMutation.mutate({ data: { name, isShared: false } });
  }

  function skipTrip() {
    if (!pendingTxRef.current) return;
    pendingTxRef.current.tripId = null;
    setTripResolution({ kind: "idle" });
    advanceResolutionChain();
  }

  function chooseExistingStudio(id: number) {
    if (!pendingTxRef.current) return;
    pendingTxRef.current.studioId = id;
    setStudioResolution({ kind: "idle" });
    advanceResolutionChain();
  }

  function confirmNewStudio(name: string) {
    createStudioMutation.mutate({ data: { name } });
  }

  function skipStudio() {
    if (!pendingTxRef.current) return;
    pendingTxRef.current.studioId = null;
    setStudioResolution({ kind: "idle" });
    advanceResolutionChain();
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(manualForm.amount);
    if (!manualForm.amount || isNaN(amt) || amt <= 0) {
      toast({ title: language === "ar" ? "مبلغ غير صحيح" : "Invalid amount", description: language === "ar" ? "أدخل مبلغاً أكبر من الصفر" : "Enter an amount greater than zero", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      data: {
        type: manualForm.type,
        amount: amt,
        currency: manualForm.currency,
        clientId: manualForm.clientId ? parseInt(manualForm.clientId) : null,
        tripId: manualForm.tripId ? parseInt(manualForm.tripId) : null,
        studioId: manualForm.studioId ? parseInt(manualForm.studioId) : null,
        description: manualForm.description || null,
        status: manualForm.status,
        date: manualForm.date,
      },
    });
  }

  const isLoading = createMutation.isPending || createClientMutation.isPending || createTripMutation.isPending || createStudioMutation.isPending;
  const ChevronBack = language === "ar" ? ChevronRight : ChevronLeft;

  return (
    <div className={cn("p-4 max-w-lg mx-auto pb-24 lg:pb-6", language === "ar" ? "text-right" : "text-left")}>
      {/* Header */}
      <div className="flex items-center gap-3 pt-2 mb-6">
        <button
          onClick={() => setLocation("/transactions")}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
        >
          <ChevronBack className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">{t("newTransaction")}</h1>
          <p className="text-muted-foreground text-xs">{t("newTransactionDesc")}</p>
        </div>
      </div>

      {/* ── Client Resolution Modal ── */}
      {clientResolution.kind !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 w-full max-w-sm">
            {clientResolution.kind === "similar" ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-5 h-5 text-amber-500" />
                  <h2 className="font-bold text-foreground">{t("similarClientsTitle")}</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {tr(language, "similarClientsDesc", { name: clientResolution.inputName })}
                </p>
                <div className="space-y-2 mb-4">
                  {clientResolution.matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => chooseExistingClient(m.id)}
                      disabled={isLoading}
                      className="w-full flex items-center gap-3 p-3 bg-accent rounded-xl text-right hover:bg-primary/10 transition-colors disabled:opacity-50"
                      data-testid={`btn-choose-client-${m.id}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                        {m.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-sm">{m.name}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-border pt-3 space-y-2">
                  <button
                    onClick={() => {
                      setClientResolution({ kind: "new", name: clientResolution.inputName });
                    }}
                    className="w-full flex items-center justify-center gap-2 border border-primary text-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/10 transition-colors"
                    data-testid="btn-new-client-from-similar"
                  >
                    <UserPlus className="w-4 h-4" />
                    {tr(language, "newClientLabel", { name: clientResolution.inputName })}
                  </button>
                  <button
                    onClick={skipClient}
                    disabled={isLoading}
                    className="w-full text-muted-foreground text-sm py-2 hover:text-foreground transition-colors"
                    data-testid="btn-skip-client"
                  >
                    {t("skipClient")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <UserPlus className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-foreground">{t("newClientTitle")}</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{language === "ar" ? "الاسم" : "Name"}</p>
                <div className="bg-accent rounded-xl px-3 py-2 mb-4 font-semibold text-foreground">
                  {clientResolution.name}
                </div>
                <label className="text-sm text-muted-foreground mb-1 block">
                  {t("phoneOptional")} <span className="text-muted-foreground/60">{t("phoneOptionalHint")}</span>
                </label>
                <input
                  type="tel"
                  value={newClientPhone}
                  onChange={(e) => setNewClientPhone(e.target.value)}
                  placeholder="05XXXXXXXX"
                  className="w-full border border-border rounded-xl px-4 py-2.5 text-sm bg-background mb-4 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  data-testid="input-new-client-phone"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmNewClient(clientResolution.name);
                  }}
                />
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={skipClient}
                    disabled={isLoading}
                    className="border border-border rounded-xl py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    data-testid="btn-skip-new-client"
                  >
                    {t("ignore")}
                  </button>
                  <button
                    onClick={() => confirmNewClient(clientResolution.name)}
                    disabled={isLoading}
                    className="bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                    data-testid="btn-confirm-new-client"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    {t("addAndSave")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Trip Resolution Modal ── */}
      {tripResolution.kind !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 w-full max-w-sm">
            {tripResolution.kind === "similar" ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Map className="w-5 h-5 text-amber-500" />
                  <h2 className="font-bold text-foreground">{t("similarTripsTitle")}</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {tr(language, "similarTripsDesc", { name: tripResolution.inputName })}
                </p>
                <div className="space-y-2 mb-4">
                  {tripResolution.matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => chooseExistingTrip(m.id)}
                      disabled={isLoading}
                      className="w-full flex items-center gap-3 p-3 bg-accent rounded-xl text-right hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-sm">{m.name}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-border pt-3 space-y-2">
                  <button
                    onClick={() => setTripResolution({ kind: "new", name: tripResolution.inputName })}
                    className="w-full flex items-center justify-center gap-2 border border-primary text-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/10 transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    {tr(language, "newTripLabel", { name: tripResolution.inputName })}
                  </button>
                  <button
                    onClick={skipTrip}
                    disabled={isLoading}
                    className="w-full text-muted-foreground text-sm py-2 hover:text-foreground transition-colors"
                  >
                    {t("skipTrip")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Map className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-foreground">{t("newTripTitle")}</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{language === "ar" ? "الاسم" : "Name"}</p>
                <div className="bg-accent rounded-xl px-3 py-2 mb-4 font-semibold text-foreground">
                  {tripResolution.name}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={skipTrip}
                    disabled={isLoading}
                    className="border border-border rounded-xl py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {t("ignore")}
                  </button>
                  <button
                    onClick={() => confirmNewTrip(tripResolution.name)}
                    disabled={isLoading}
                    className="bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Map className="w-4 h-4" />}
                    {t("addAndSave")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Studio Resolution Modal ── */}
      {studioResolution.kind !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-5 w-full max-w-sm">
            {studioResolution.kind === "similar" ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-amber-500" />
                  <h2 className="font-bold text-foreground">{t("similarStudiosTitle")}</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {tr(language, "similarStudiosDesc", { name: studioResolution.inputName })}
                </p>
                <div className="space-y-2 mb-4">
                  {studioResolution.matches.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => chooseExistingStudio(m.id)}
                      disabled={isLoading}
                      className="w-full flex items-center gap-3 p-3 bg-accent rounded-xl text-right hover:bg-primary/10 transition-colors disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-sm">{m.name}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-border pt-3 space-y-2">
                  <button
                    onClick={() => setStudioResolution({ kind: "new", name: studioResolution.inputName })}
                    className="w-full flex items-center justify-center gap-2 border border-primary text-primary rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/10 transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    {tr(language, "newStudioLabel", { name: studioResolution.inputName })}
                  </button>
                  <button
                    onClick={skipStudio}
                    disabled={isLoading}
                    className="w-full text-muted-foreground text-sm py-2 hover:text-foreground transition-colors"
                  >
                    {t("skipStudio")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <Building2 className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-foreground">{t("newStudioTitle")}</h2>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{language === "ar" ? "الاسم" : "Name"}</p>
                <div className="bg-accent rounded-xl px-3 py-2 mb-4 font-semibold text-foreground">
                  {studioResolution.name}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={skipStudio}
                    disabled={isLoading}
                    className="border border-border rounded-xl py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {t("ignore")}
                  </button>
                  <button
                    onClick={() => confirmNewStudio(studioResolution.name)}
                    disabled={isLoading}
                    className="bg-primary text-primary-foreground rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
                    {t("addAndSave")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Step: Input ── */}
      {step === "input" ? (
        <div className="space-y-5">
          {/* Voice toggle button */}
          <div className="flex flex-col items-center py-8 bg-card border border-border rounded-2xl shadow-sm">
            <p className="text-sm text-muted-foreground mb-2 text-center px-4">
              {t("voiceHint")}
            </p>
            <p className="text-xs text-muted-foreground/70 mb-5 text-center px-4">
              {t("voiceExample")}
            </p>
            <button
              onClick={toggleVoiceRecording}
              disabled={parseMutation.isPending}
              className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 select-none",
                isRecording
                  ? "bg-red-500 scale-105 animate-recording"
                  : parseMutation.isPending
                  ? "bg-muted cursor-not-allowed"
                  : "bg-primary hover:bg-primary/90 active:scale-95"
              )}
              data-testid="btn-voice-record"
            >
              {parseMutation.isPending ? (
                <Loader2 className="w-9 h-9 text-white animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-9 h-9 text-white" />
              ) : (
                <Mic className="w-9 h-9 text-white" />
              )}
            </button>
            {isRecording && (
              <p className="text-red-500 text-sm mt-4 font-semibold animate-pulse">
                {t("recording")}
              </p>
            )}
            {parseMutation.isPending && (
              <p className="text-muted-foreground text-sm mt-4">{t("analyzing")}</p>
            )}
          </div>

          {/* Text input */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{t("orTypeDirectly")}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleParseText()}
                placeholder={t("textPlaceholder")}
                className="flex-1 border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="input-text-transaction"
              />
              <button
                onClick={handleParseText}
                disabled={parseMutation.isPending || !textInput.trim()}
                className="bg-primary text-primary-foreground px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                data-testid="btn-parse-text"
              >
                {parseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("analyzeBtn")}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{t("orEnterManually")}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Manual form */}
          <form onSubmit={handleManualSubmit} className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("typeLabel")}</label>
                <select
                  value={manualForm.type}
                  onChange={(e) => setManualForm({ ...manualForm, type: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  data-testid="select-type"
                >
                  <option value="income">{t("typeIncome")}</option>
                  <option value="expense">{t("typeExpense")}</option>
                  <option value="payment">{t("typePayment")}</option>
                  <option value="receipt">{t("typeReceipt")}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("currencyLabel")}</label>
                <select
                  value={manualForm.currency}
                  onChange={(e) => setManualForm({ ...manualForm, currency: e.target.value })}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  data-testid="select-currency"
                >
                  {settings.currencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("amountLabel")}</label>
              <input
                type="number"
                value={manualForm.amount}
                onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                placeholder="0.00"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="input-amount"
                required
              />
            </div>
            {(showClients || showTrips || showStudios) && (
              <div className="grid grid-cols-2 gap-3">
                {showClients && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("clientLabel")}</label>
                    <select
                      value={manualForm.clientId}
                      onChange={(e) => setManualForm({ ...manualForm, clientId: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                      data-testid="select-client"
                    >
                      <option value="">{t("noClient")}</option>
                      {clients?.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {showTrips && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("tripLabel")}</label>
                    <select
                      value={manualForm.tripId}
                      onChange={(e) => setManualForm({ ...manualForm, tripId: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                      data-testid="select-trip"
                    >
                      <option value="">{t("noTripOption")}</option>
                      {trips?.map((tp) => (
                        <option key={tp.id} value={tp.id}>{tp.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {showStudios && (
                  <div className={!showClients && !showTrips ? "col-span-2" : ""}>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("studioLabel")}</label>
                    <select
                      value={manualForm.studioId}
                      onChange={(e) => setManualForm({ ...manualForm, studioId: e.target.value })}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                      data-testid="select-studio"
                    >
                      <option value="">{language === "ar" ? "بدون استوديو" : "No studio"}</option>
                      {studios?.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("dateLabel")}</label>
              <input
                type="date"
                value={manualForm.date}
                onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="input-date"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("descriptionLabel")}</label>
              <input
                type="text"
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                placeholder={language === "ar" ? "وصف اختياري" : "Optional description"}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="input-description"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("statusLabel")}</label>
              <select
                value={manualForm.status}
                onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="select-status"
              >
                <option value="pending">{t("statusPending")}</option>
                <option value="settled">{t("statusSettled")}</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="btn-submit-manual"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("newTransaction")}
            </button>
          </form>
        </div>
      ) : (
        /* ── Step: Confirm ── */
        <div className="space-y-4">
          <div className="bg-card border-2 border-primary/20 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-primary" />
              <h2 className="font-bold text-foreground">{t("confirmTransaction")}</h2>
            </div>

            {parsed?.rawText && (
              <div className="bg-muted rounded-xl p-3 mb-4">
                <p className="text-xs text-muted-foreground mb-1">{language === "ar" ? "النص الأصلي" : "Original text"}</p>
                <p className="text-sm text-foreground">{parsed.rawText}</p>
              </div>
            )}

            <div className="space-y-0">
              {[
                { label: language === "ar" ? "نوع العملية" : "Type", value: parsed?.type ? typeLabel(parsed.type, language) : null },
                {
                  label: language === "ar" ? "المبلغ" : "Amount",
                  value:
                    parsed?.amount && parsed?.currency
                      ? formatAmount(parsed.amount, parsed.currency)
                      : null,
                  bold: true,
                },
                {
                  label: language === "ar" ? "العملة" : "Currency",
                  value: parsed?.currency,
                  badge: parsed?.currency ? currencyClass(parsed.currency) : undefined,
                },
                { label: language === "ar" ? "الزبون" : "Client", value: parsed?.clientName },
                { label: language === "ar" ? "الرحلة" : "Trip", value: parsed?.tripName },
                { label: language === "ar" ? "الاستديو" : "Studio", value: parsed?.studioName },
                { label: language === "ar" ? "الوصف" : "Description", value: parsed?.description },
              ]
                .filter((r) => r.value)
                .map((row, i, arr) => (
                  <div
                    key={row.label}
                    className={cn(
                      "flex items-center justify-between py-2.5",
                      i < arr.length - 1 ? "border-b border-border" : ""
                    )}
                  >
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    {row.badge ? (
                      <span className={cn("text-xs font-bold px-2 py-1 rounded-full", row.badge)}>
                        {row.value}
                      </span>
                    ) : (
                      <span className={cn("text-sm font-semibold", row.bold ? "text-primary text-base" : "")}>
                        {row.value}
                      </span>
                    )}
                  </div>
                ))}
            </div>

            {/* Status indicators for client / trip / studio */}
            {(parsed?.clientName || parsed?.tripName || parsed?.studioName) && (
              <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                {parsed?.clientName && (
                  (parsed.clientId != null && clients?.some((c) => c.id === parsed.clientId)) || clients?.find((c) => norm(c.name) === norm(parsed.clientName!)) ? (
                    <div className="flex items-center gap-2 text-green-600 text-xs">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{language === "ar" ? "زبون موجود — سيتم ربطه تلقائياً" : "Existing client — will be linked automatically"}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600 text-xs">
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>
                        «{parsed.clientName}» —{" "}
                        {findSimilarClients(parsed.clientName).length > 0
                          ? (language === "ar" ? "سيُطلب منك التأكيد على الاسم" : "You'll be asked to confirm the name")
                          : (language === "ar" ? "زبون جديد، ستتمكن من إضافة رقم هاتفه" : "New client, you can add their phone number")}
                      </span>
                    </div>
                  )
                )}
                {parsed?.tripName && (
                  (parsed.tripId != null && trips?.some((t) => t.id === parsed.tripId)) || trips?.find((t) => norm(t.name) === norm(parsed.tripName!)) ? (
                    <div className="flex items-center gap-2 text-green-600 text-xs">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{language === "ar" ? "رحلة موجودة — سيتم ربطها تلقائياً" : "Existing trip — will be linked automatically"}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600 text-xs">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>
                        «{parsed.tripName}» —{" "}
                        {findSimilarTrips(parsed.tripName).length > 0
                          ? (language === "ar" ? "سيُطلب منك التأكيد على اسم الرحلة" : "You'll be asked to confirm the trip")
                          : (language === "ar" ? "رحلة جديدة، ستتمكن من إضافتها" : "New trip, you can add it")}
                      </span>
                    </div>
                  )
                )}
                {parsed?.studioName && (
                  (parsed.studioId != null && studios?.some((s) => s.id === parsed.studioId)) || studios?.find((s) => norm(s.name) === norm(parsed.studioName!)) ? (
                    <div className="flex items-center gap-2 text-green-600 text-xs">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{language === "ar" ? "استديو موجود — سيتم ربطه تلقائياً" : "Existing studio — will be linked automatically"}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-600 text-xs">
                      <Building2 className="w-3.5 h-3.5" />
                      <span>
                        «{parsed.studioName}» —{" "}
                        {findSimilarStudios(parsed.studioName).length > 0
                          ? (language === "ar" ? "سيُطلب منك التأكيد على اسم الاستديو" : "You'll be asked to confirm the studio")
                          : (language === "ar" ? "استديو جديد، ستتمكن من إضافته" : "New studio, you can add it")}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                setParsed(null);
                setStep("input");
                setTextInput("");
              }}
              className="flex items-center justify-center gap-2 border border-border rounded-xl py-3 text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
              data-testid="btn-cancel-confirm"
            >
              <XCircle className="w-4 h-4" />
              {t("cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
              data-testid="btn-confirm-transaction"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4" />
              )}
              {t("confirmAndSave")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
