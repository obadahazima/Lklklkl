import { formatNumber } from "@workspace/api-client-react";
import { OpeningBalanceOptions } from "@/components/opening-balance-options";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { webLedger } from "@/lib/offline-ledger";
import { OfflineQueuePanel } from "@/components/offline-ledger";
import {
  useParseVoiceInput, useManualDraft, useOfflineLedger, transactionError, manualErrorMessage,
  transcribeVoice, localISODate, normalizeAmountInput, normalizeEntityName, voiceAccountSelection, voiceBlobPayload,
  useCreateTransaction,
  useCreateClient,
  useCreateTrip,
  useListClients,
  useListTrips,
  useListAccounts,
  useCreateAccount,
  getListTransactionsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetRecentTransactionsQueryKey,
  getListClientsQueryKey,
  getListTripsQueryKey,
  getListAccountsQueryKey,
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
  PlusCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  accountName?: string | null;
  accountId?: number | null;
  toAccountName?: string | null;
  toAccountId?: number | null;
  detectedLanguage?: string | null;
  description?: string | null;
  status?: "pending" | "settled" | null;
  date?: string | null;
  rawText?: string | null;
};

type ResolutionState =
  | { kind: "idle" }
  | { kind: "similar"; matches: { id: number; name: string }[]; inputName: string }
  | { kind: "new"; name: string };

type ClientResolutionState = ResolutionState;
type TripResolutionState = ResolutionState;

type PendingTx = {
  includedInOpeningBalance?: boolean; destinationIncludedInOpeningBalance?: boolean;
  type: string; amount: number; currency: string;
  description: string | null; status: string; date: string;
  clientId: number | null | undefined;
  tripId: number | null | undefined;
  accountId: number | null | undefined;
  toAccountId: number | null | undefined;
};

function AddAccountPanel({
  language,
  newAccountName,
  setNewAccountName,
  newAccountType,
  setNewAccountType,
  onSave,
  onCancel,
  saving,
}: {
  language: string;
  newAccountName: string;
  setNewAccountName: (v: string) => void;
  newAccountType: string;
  setNewAccountType: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div className="flex gap-2 items-center flex-wrap p-2 border border-border rounded-lg bg-muted/40">
      <input
        autoFocus
        value={newAccountName}
        onChange={(e) => setNewAccountName(e.target.value)}
        placeholder={language === "ar" ? "اسم الحساب (مثلاً: فيزا الشغل)" : "Account name (e.g. Visa)"}
        className="flex-1 min-w-[140px] border border-border rounded-md px-2 py-1.5 text-sm bg-background"
      />
      <select
        value={newAccountType}
        onChange={(e) => setNewAccountType(e.target.value)}
        className="border border-border rounded-md px-2 py-1.5 text-sm bg-background"
      >
        <option value="cash">{language === "ar" ? "كاش" : "Cash"}</option>
        <option value="debit">{language === "ar" ? "بطاقة ديبت" : "Debit card"}</option>
        <option value="credit">{language === "ar" ? "بطاقة ائتمان" : "Credit card"}</option>
      </select>
      <button
        type="button"
        onClick={onSave}
        disabled={!newAccountName.trim() || saving}
        className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
      >
        {language === "ar" ? "إضافة" : "Add"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted"
      >
        {language === "ar" ? "إلغاء" : "Cancel"}
      </button>
    </div>
  );
}

export default function NewTransaction() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { language, showClients, showTrips } = settings;
  const { userId } = useAuth();
  const offline = useOfflineLedger(webLedger, userId);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const saveAnotherRef = useRef(false);
  const t = (k: Parameters<typeof tr>[1]) => tr(language, k);

  const [step, setStep] = useState<"input" | "confirm">("input");
  const [textInput, setTextInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [parsed, setParsed] = useState<ParsedData | null>(null);

  const [clientResolution, setClientResolution] = useState<ClientResolutionState>({ kind: "idle" });
  const [newClientPhone, setNewClientPhone] = useState("");
  const [tripResolution, setTripResolution] = useState<TripResolutionState>({ kind: "idle" });

  const pendingTxRef = useRef<PendingTx | null>(null);
  const saveInFlightRef = useRef(false);

  const [manualForm, setManualForm, draft] = useManualDraft(webLedger, userId, {
    includedInOpeningBalance: "", destinationIncludedInOpeningBalance: "",
    type: "expense",
    amount: "",
    currency: settings.primaryCurrency,
    clientId: "",
    tripId: "",
    accountId: "",
    toAccountId: "",
    description: "",
    status: "pending",
    date: localISODate(),
  });
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("cash");
  const [addAccountTarget, setAddAccountTarget] = useState<"accountId" | "toAccountId">("accountId");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mountedRef = useRef(true);
  const parseRequestRef = useRef(0);
  const recordingBusyRef = useRef(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ++parseRequestRef.current;
      recognitionRef.current?.abort();
      const recorder = mediaRecorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const { data: clientsRemote } = useListClients();
  const clients = clientsRemote ?? offline.record.references.clients;
  const { data: tripsRemote } = useListTrips();
  const trips = tripsRemote ?? offline.record.references.trips;
  const { data: accountsRemote } = useListAccounts();
  const accounts = accountsRemote ?? offline.record.references.accounts;

  // If there's exactly one account, default to it so most users never have to touch this field.
  useEffect(() => {
    if (accounts && accounts.length === 1 && !manualForm.accountId) {
      setManualForm((f) => ({ ...f, accountId: String(accounts[0].id) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, draft.ready]);

  const createAccountMutation = useCreateAccount({
    mutation: {
      onSuccess: (newAccount) => {
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        setManualForm((f) => ({ ...f, [addAccountTarget]: String(newAccount.id) }));
        setShowAddAccount(false);
        setNewAccountName("");
        toast({ title: language === "ar" ? "تمت إضافة الحساب" : "Account added", description: newAccount.name });
      },
    },
  });

  function openAddAccount(target: "accountId" | "toAccountId") {
    setAddAccountTarget(target);
    setNewAccountName("");
    setNewAccountType("cash");
    setShowAddAccount(true);
  }

  function handleAddAccount() {
    if (!newAccountName.trim()) return;
    createAccountMutation.mutate({
      data: { name: newAccountName.trim(), type: newAccountType, currency: manualForm.currency },
    });
  }

  const parseMutation = useParseVoiceInput();

  async function analyzeText(text: string) {
    const request = ++parseRequestRef.current;
    try {
      const data = await parseMutation.mutateAsync({ data: { text, currencies: settings.currencies, primaryCurrency: settings.primaryCurrency, referenceDate: localISODate() } });
      if (!mountedRef.current || request !== parseRequestRef.current) return;
      if (data.success) {
        setManualForm(f=>({...f,includedInOpeningBalance:"",destinationIncludedInOpeningBalance:""}));
        setParsed(data);
        setStep("confirm");
        setManualForm((f) => ({ ...f, ...voiceAccountSelection(data, accounts ?? []) }));
      } else {
        toast({ title: language === "ar" ? "بدنا توضيح" : "Please clarify", description: data.error || (language === "ar" ? "عدّل النص وأعد التحليل" : "Edit the text and try again"), variant: "destructive" });
      }
    } catch (err) {
      if (!mountedRef.current || request !== parseRequestRef.current) return;
      const detail = (err as { data?: { message?: string; error?: string } }).data;
      toast({ title: language === "ar" ? "خطأ في التحليل" : "Analysis error", description: detail?.message || detail?.error || (language === "ar" ? "حاول مرة أخرى" : "Please try again"), variant: "destructive" });
    }
  }

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

  const createMutation = useCreateTransaction({
    mutation: {
      onSettled: () => { saveInFlightRef.current = false; },
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentTransactionsQueryKey() });
        toast({ title: t("savedSuccess"), description: result.collectionSummary || t("savedDesc") });
        setLocation("/transactions");
      },
      onError: () => {
        toast({ title: t("saveError"), description: t("saveErrorDesc"), variant: "destructive" });
      },
    },
  });

  async function toggleVoiceRecording() {
    if (recordingBusyRef.current || isTranscribing || parseMutation.isPending) return;
    if (isRecording) {
      recognitionRef.current?.stop();
      if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
      return;
    }
    type SpeechRecognitionCtor = new () => SpeechRecognition;
    const w = window as Window & { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Ctor) {
      const recognition = new Ctor();
      recognition.lang = language === "ar" ? "ar-AE" : "en-US";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;
      let finalTranscript = "";
      let interimTranscript = "";
      let failed = false;
      recordingBusyRef.current = true;
      recognition.onstart = () => { recordingBusyRef.current = false; if (mountedRef.current) setIsRecording(true); };
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        finalTranscript = "";
        interimTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript + " ";
          else interimTranscript += event.results[i][0].transcript + " ";
        }
        if (mountedRef.current) setTextInput((finalTranscript + interimTranscript).trim());
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return;
        recordingBusyRef.current = false;
        recognitionRef.current = null;
        if (!mountedRef.current) return;
        setIsRecording(false);
        const text = (finalTranscript + interimTranscript).trim();
        // Keep the last interim words too; stopping early must not discard an amount.
        if (!failed && text) { setTextInput(text); void analyzeText(text); }
      };
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (recognitionRef.current !== recognition) return;
        failed = true;
        recordingBusyRef.current = false;
        if (!mountedRef.current) return;
        setIsRecording(false);
        toast({ title: language === "ar" ? "تعذّر التسجيل" : "Recording error", description: event.error === "not-allowed"
          ? (language === "ar" ? "اسمح باستخدام الميكروفون من إعدادات المتصفح" : "Allow microphone access in browser settings")
          : (language === "ar" ? "النص المسموع محفوظ؛ عدّله واضغط تحليل أو أعد التسجيل" : "Edit the captured text and analyze it, or record again"), variant: "destructive" });
      };
      recognitionRef.current = recognition;
      try { recognition.start(); } catch { recordingBusyRef.current = false; recognitionRef.current = null; toast({ title: language === "ar" ? "تعذّر بدء التسجيل" : "Could not start recording", variant: "destructive" }); }
      return;
    }
    // Browsers without SpeechRecognition can still upload real audio for transcription.
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: language === "ar" ? "الصوت غير مدعوم؛ استخدم خانة النص" : "Voice unavailable; use text input", variant: "destructive" });
      return;
    }
    recordingBusyRef.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      mediaStreamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((mime) => MediaRecorder.isTypeSupported(mime));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
        if (!mountedRef.current) return;
        setIsRecording(false);
        setIsTranscribing(true);
        const request = ++parseRequestRef.current;
        try {
          const result = await transcribeVoice(await voiceBlobPayload(new Blob(chunks, { type: recorder.mimeType || "audio/webm" })));
          if (!mountedRef.current || request !== parseRequestRef.current) return;
          if (!result.success || !result.text) throw new Error(result.error || "لم يتم التعرف على كلام");
          setTextInput(result.text);
          await analyzeText(result.text);
        } catch (err) {
          if (mountedRef.current && request === parseRequestRef.current) toast({ title: language === "ar" ? "تعذّر تحويل الصوت" : "Transcription failed", description: (err as Error).message, variant: "destructive" });
        } finally { if (mountedRef.current) setIsTranscribing(false); }
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (mountedRef.current) { setIsRecording(false); toast({ title: language === "ar" ? "فشل التسجيل، حاول مجدداً" : "Recording failed; try again", variant: "destructive" }); }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setTextInput("");
      setIsRecording(true);
    } catch {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      toast({ title: language === "ar" ? "تعذّر التسجيل، تحقّق من إذن الميكروفون" : "Check microphone permission", variant: "destructive" });
    } finally { recordingBusyRef.current = false; }
  }

  function handleParseText() {
    if (textInput.trim() && !isRecording && !isTranscribing && !parseMutation.isPending) void analyzeText(textInput.trim());
  }

  const norm = normalizeEntityName;

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

  function savePendingTransaction() {
    const p = pendingTxRef.current;
    if (!p || saveInFlightRef.current) return;
    if (!p.accountId) {
      toast({
        title: language === "ar" ? "لازم تحدد الحساب" : "Account required",
        description: language === "ar" ? "اختر من أي حساب أو بطاقة طلعت/دخلت المصاري" : "Choose which account/card this transaction went through",
        variant: "destructive",
      });
      return;
    }
    if (p.type === "transfer") {
      if (!p.toAccountId) {
        toast({
          title: language === "ar" ? "لازم تحدد الحساب الوجهة" : "Destination account required",
          description: language === "ar" ? "اختر الحساب اللي دخلت فيه المصاري" : "Choose the account the money went into",
          variant: "destructive",
        });
        return;
      }
      if (p.toAccountId === p.accountId) {
        toast({
          title: language === "ar" ? "الحسابان متطابقان" : "Same account chosen twice",
          description: language === "ar" ? "لازم يكون الحساب المصدر والوجهة مختلفين" : "Source and destination accounts must differ",
          variant: "destructive",
        });
        return;
      }
    }
    saveInFlightRef.current = true;
    createMutation.mutate({
      data: {
        includedInOpeningBalance: p.includedInOpeningBalance, destinationIncludedInOpeningBalance: p.destinationIncludedInOpeningBalance,
        type: p.type,
        amount: p.amount,
        currency: p.currency,
        clientId: p.type === "transfer" ? null : (p.clientId ?? null),
        tripId: p.type === "transfer" ? null : (p.tripId ?? null),
        accountId: p.accountId,
        toAccountId: p.type === "transfer" ? p.toAccountId ?? null : null,
        description: p.description,
        status: p.status,
        date: p.date,
      },
    });
  }

  function advanceResolutionChain() {
    const p = pendingTxRef.current;
    if (!p) return;

    // Transfers never involve a client/trip.
    if (p.type === "transfer") {
      p.clientId = null;
      p.tripId = null;
      savePendingTransaction();
      return;
    }

    // Skip hidden entity types from settings
    if (!showClients && p.clientId === undefined) p.clientId = null;
    if (!showTrips && p.tripId === undefined) p.tripId = null;

    if (p.clientId === undefined) {
      const name = parsed?.clientName?.trim();
      const aiId = parsed?.clientId;
      // Server already validated this id against the user's own clients → trust it directly (avoids duplicate-create race if list isn't loaded yet)
      if (aiId != null) { p.clientId = aiId; }
      else if (!name) { p.clientId = null; }
      else {
        const exactMatches = clients?.filter((c) => norm(c.name) === norm(name)) ?? [];
        const exact = exactMatches.length === 1 ? exactMatches[0] : undefined;
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
        const exactMatches = trips?.filter((t) => norm(t.name) === norm(name)) ?? [];
        const exact = exactMatches.length === 1 ? exactMatches[0] : undefined;
        if (exact) { p.tripId = exact.id; }
        else {
          const similar = findSimilarTrips(name);
          if (similar.length > 0) { setTripResolution({ kind: "similar", matches: similar, inputName: name }); return; }
          else { setTripResolution({ kind: "new", name }); return; }
        }
      }
    }

    savePendingTransaction();
  }

  function handleConfirm() {
    if (!parsed) return;
    if (!Number.isFinite(parsed.amount) || !parsed.amount || parsed.amount <= 0) {
      toast({ title: language === "ar" ? "أدخل مبلغاً صحيحاً أكبر من الصفر" : "Enter a valid positive amount", variant: "destructive" });
      return;
    }
    pendingTxRef.current = {
      includedInOpeningBalance: manualForm.includedInOpeningBalance === "true", destinationIncludedInOpeningBalance: manualForm.destinationIncludedInOpeningBalance === "true",
      type: parsed.type || "expense",
      amount: parsed.amount || 0,
      currency: parsed.currency || settings.primaryCurrency,
      description: parsed.description ?? null,
      status: parsed.status === "settled" ? "settled" : "pending",
      date: parsed.date || localISODate(),
      clientId: undefined,
      tripId: undefined,
      accountId: manualForm.accountId ? parseInt(manualForm.accountId) : null,
      toAccountId: manualForm.toAccountId ? parseInt(manualForm.toAccountId) : null,
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

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saveInFlightRef.current || !draft.ready || !userId) return;
    const payload = {
      includedInOpeningBalance: manualForm.includedInOpeningBalance === "true", destinationIncludedInOpeningBalance: manualForm.destinationIncludedInOpeningBalance === "true",
      type: manualForm.type, amount: normalizeAmountInput(manualForm.amount), currency: manualForm.currency,
      clientId: manualForm.type === "transfer" ? null : (manualForm.clientId ? Number(manualForm.clientId) : null),
      tripId: manualForm.type === "transfer" ? null : (manualForm.tripId ? Number(manualForm.tripId) : null),
      accountId: Number(manualForm.accountId), toAccountId: manualForm.type === "transfer" ? Number(manualForm.toAccountId) : null,
      description: manualForm.description || null, status: manualForm.status, date: manualForm.date,
    };
    const error = transactionError(payload) ?? (!settings.currencies.includes(payload.currency) ? "invalid_currency" : null);
    if (error) { toast({ title: manualErrorMessage(error, language === "ar"), variant: "destructive" }); return; }
    saveInFlightRef.current = true;
    setSavingLocal(true);
    try {
      await webLedger.enqueue(userId, payload, draft.id);
      const next = { ...manualForm, amount: "", description: "", clientId: "", tripId: "", toAccountId: "", includedInOpeningBalance: "", destinationIncludedInOpeningBalance: "", date: localISODate() };
      const nextDraft = { id: webLedger.uuid(), values: next };
      await webLedger.saveDraft(userId, nextDraft.id, next).catch(() => {});
      draft.restore(nextDraft);
      toast({ title: language === "ar" ? "حُفظت المعاملة على الجهاز" : "Saved on this device", description: language === "ar" ? "ستظهر بحسابك بعد المزامنة؛ يمكنك متابعة الإدخال" : "It will appear in your account after syncing. You can keep entering transactions." });
      if (saveAnotherRef.current) requestAnimationFrame(() => amountInputRef.current?.focus());
      else setLocation("/transactions");
    } catch {
      toast({ title: language === "ar" ? "تعذر الحفظ المحلي؛ بياناتك ما زالت بالنموذج" : "Local save failed; your form is still here", variant: "destructive" });
    } finally { saveInFlightRef.current = false; setSavingLocal(false); saveAnotherRef.current = false; }
  }

  const [savingLocal, setSavingLocal] = useState(false);
  const isLoading = savingLocal || createMutation.isPending || createClientMutation.isPending || createTripMutation.isPending || createAccountMutation.isPending;
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

      <OfflineQueuePanel owner={userId} ar={language === "ar"} onRecover={(recovered) => { draft.restore(recovered); setStep("input"); }} />
      {draft.error && <p role="alert" className="text-red-600">{language === "ar" ? "تعذر حفظ المسودة محلياً؛ أبقِ الصفحة مفتوحة" : "Draft storage unavailable; keep this page open"}</p>}
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

      {/* ── Step: Input ── */}
      {step === "input" ? (
        <div className="space-y-5">
          {/* Voice toggle button */}
          <section className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 sm:p-5 space-y-3" aria-label={language === "ar" ? "إضافة معاملة بالصوت" : "Add a transaction by voice"}>
            <button
              type="button"
              onClick={toggleVoiceRecording}
              disabled={(parseMutation.isPending || isTranscribing)}
              aria-pressed={isRecording}
              className={cn(
                "w-full min-h-32 rounded-2xl flex items-center justify-center gap-4 px-4 py-5 text-white shadow-lg transition-colors select-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:opacity-70",
                isRecording
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-primary hover:bg-primary/90 active:scale-95"
              )}
              data-testid="btn-voice-record"
            >
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/20">
              {(parseMutation.isPending || isTranscribing) ? (
                <Loader2 className="w-9 h-9 text-white animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-9 h-9 text-white" />
              ) : (
                <Mic className="w-9 h-9 text-white" />
              )}
              </span>
              <span className="text-start space-y-1">
                <span className="block text-xl sm:text-2xl font-bold">{(parseMutation.isPending || isTranscribing)
                  ? (language === "ar" ? "جاري فهم معاملتك…" : "Understanding your transaction…")
                  : isRecording
                  ? (language === "ar" ? "إيقاف التسجيل وتحليل المعاملة" : "Stop recording and analyze")
                  : (language === "ar" ? "سجّل معاملتك بصوتك" : "Record your transaction")}</span>
                <span className="block text-sm opacity-90">{isRecording
                  ? (language === "ar" ? "اضغط لما تخلّص الحكي" : "Tap when you finish speaking")
                  : (language === "ar" ? "اضغط واحكي، وبيلي بيرتّب التفاصيل" : "Tap and speak. Billy fills in the details.")}</span>
              </span>
            </button>
            <p className="text-sm text-muted-foreground text-center">{t("voiceExample")}</p>
            <p className="text-xs text-muted-foreground text-center">{language === "ar" ? "التسجيل والتحليل بيحتاجوا إنترنت · بتراجع المعاملة قبل حفظها" : "Internet required · Review your transaction before saving"}</p>
            {textInput && <p className="rounded-xl bg-card p-3 text-sm break-words" aria-live="polite">{textInput}</p>}
            {isRecording && (
              <p className="text-red-500 text-sm mt-4 font-semibold animate-pulse">
                {t("recording")}
              </p>
            )}
            {(parseMutation.isPending || isTranscribing) && (
              <p className="text-muted-foreground text-sm mt-4">{t("analyzing")}</p>
            )}
          </section>

          {/* Text input */}
          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">{language === "ar" ? "أو اكتب المعاملة بجملة" : "Or describe your transaction in text"}</summary>
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
                disabled={parseMutation.isPending || isTranscribing || isRecording || !textInput.trim()}
                className="bg-primary text-primary-foreground px-4 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
                data-testid="btn-parse-text"
              >
                {(parseMutation.isPending || isTranscribing) ? <Loader2 className="w-4 h-4 animate-spin" /> : t("analyzeBtn")}
              </button>
            </div>
          </div>
          </details>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{t("orEnterManually")}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Manual form */}
          <form onSubmit={handleManualSubmit} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); saveAnotherRef.current = true; event.currentTarget.requestSubmit(); } }} className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <fieldset disabled={savingLocal || !draft.ready} className="contents">
            <div>
              <label htmlFor="new-transaction-field-1" className="text-xs font-medium text-muted-foreground mb-1 block">{t("amountLabel")}</label>
              <input id="new-transaction-field-1"
                type="text"
                inputMode="decimal"
                ref={amountInputRef}
                value={manualForm.amount}
                onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                placeholder="0.00"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="input-amount"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="new-transaction-field-2" className="text-xs font-medium text-muted-foreground mb-1 block">{t("typeLabel")}</label>
                <select id="new-transaction-field-2"
                  value={manualForm.type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    if (newType === "receivable") { setLocation("/receivables"); return; }
                    setManualForm((f) => ({
                      ...f,
                      type: newType,
                      // Transfers don't have a client/trip; clear them so a stale link never lingers.
                      clientId: newType === "transfer" ? "" : f.clientId,
                      tripId: newType === "transfer" ? "" : f.tripId,
                      toAccountId: newType === "transfer" ? f.toAccountId : "",
                    }));
                  }}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  data-testid="select-type"
                >
                  <option value="income">{t("typeIncome")}</option>
                  <option value="expense">{t("typeExpense")}</option>
                  <option value="transfer">{t("typeTransfer")}</option>
                  <option value="receivable">{t("receivables")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="new-transaction-field-3" className="text-xs font-medium text-muted-foreground mb-1 block">{t("currencyLabel")}</label>
                <select id="new-transaction-field-3"
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
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {manualForm.type === "transfer"
                  ? (language === "ar" ? "من حساب" : "From account")
                  : (language === "ar" ? "الحساب/البطاقة" : "Account/Card")} <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={manualForm.accountId}
                  onChange={(e) => setManualForm({ ...manualForm, accountId: e.target.value })}
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  data-testid="select-account"
                  required
                >
                  <option value="">{language === "ar" ? "اختر حساب..." : "Select account..."}</option>
                  {accounts?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatNumber(a.currentBalance, 2)} {a.currency})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => openAddAccount("accountId")}
                  className="shrink-0 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted"
                >
                  + {language === "ar" ? "جديد" : "New"}
                </button>
              </div>
              {showAddAccount && addAccountTarget === "accountId" && (
                <div className="mt-2">
                  <AddAccountPanel
                    language={language}
                    newAccountName={newAccountName}
                    setNewAccountName={setNewAccountName}
                    newAccountType={newAccountType}
                    setNewAccountType={setNewAccountType}
                    onSave={handleAddAccount}
                    onCancel={() => setShowAddAccount(false)}
                    saving={createAccountMutation.isPending}
                  />
                </div>
              )}
            </div>
            {manualForm.type === "transfer" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {language === "ar" ? "إلى حساب" : "To account"} <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2">
                  <select
                    value={manualForm.toAccountId}
                    onChange={(e) => setManualForm({ ...manualForm, toAccountId: e.target.value })}
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    data-testid="select-to-account"
                    required
                  >
                    <option value="">{language === "ar" ? "اختر حساب..." : "Select account..."}</option>
                    {accounts?.filter((a) => String(a.id) !== manualForm.accountId).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatNumber(a.currentBalance, 2)} {a.currency})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => openAddAccount("toAccountId")}
                    className="shrink-0 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted"
                  >
                    + {language === "ar" ? "جديد" : "New"}
                  </button>
                </div>
                {showAddAccount && addAccountTarget === "toAccountId" && (
                  <div className="mt-2">
                    <AddAccountPanel
                      language={language}
                      newAccountName={newAccountName}
                      setNewAccountName={setNewAccountName}
                      newAccountType={newAccountType}
                      setNewAccountType={setNewAccountType}
                      onSave={handleAddAccount}
                      onCancel={() => setShowAddAccount(false)}
                      saving={createAccountMutation.isPending}
                    />
                  </div>
                )}
              </div>
            )}
            {manualForm.type !== "transfer" && (showClients || showTrips) && (
              <div className="grid grid-cols-2 gap-3">
                {showClients && (
                  <div>
                    <label htmlFor="new-transaction-field-4" className="text-xs font-medium text-muted-foreground mb-1 block">{t("clientLabel")}</label>
                    <select id="new-transaction-field-4"
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
                    <label htmlFor="new-transaction-field-5" className="text-xs font-medium text-muted-foreground mb-1 block">{t("tripLabel")}</label>
                    <select id="new-transaction-field-5"
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
              </div>
            )}
            <div>
              <label htmlFor="new-transaction-field-6" className="text-xs font-medium text-muted-foreground mb-1 block">{t("dateLabel")}</label>
              <input id="new-transaction-field-6"
                type="date"
                value={manualForm.date}
                onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="input-date"
              />
            </div>
            <div>
              <label htmlFor="new-transaction-field-7" className="text-xs font-medium text-muted-foreground mb-1 block">{t("descriptionLabel")}</label>
              <input id="new-transaction-field-7"
                type="text"
                value={manualForm.description}
                onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                placeholder={language === "ar" ? "وصف اختياري" : "Optional description"}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="input-description"
              />
            </div>
            <div>
              <label htmlFor="new-transaction-field-8" className="text-xs font-medium text-muted-foreground mb-1 block">{t("statusLabel")}</label>
              <select id="new-transaction-field-8"
                value={manualForm.status}
                onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="select-status"
              >
                <option value="pending">{t("statusPending")}</option>
                <option value="settled">{t("statusSettled")}</option>
              </select>
            </div>
            <OpeningBalanceOptions accounts={accounts} accountId={manualForm.accountId} toAccountId={manualForm.toAccountId} type={manualForm.type} date={manualForm.date} source={manualForm.includedInOpeningBalance} destination={manualForm.destinationIncludedInOpeningBalance} onSource={v=>setManualForm(f=>({...f,includedInOpeningBalance:v}))} onDestination={v=>setManualForm(f=>({...f,destinationIncludedInOpeningBalance:v}))} ar={language === "ar"}/>
            <button
              type="submit"
              disabled={isLoading || !draft.ready}
              onClick={() => { saveAnotherRef.current = false; }}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="btn-submit-manual"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("newTransaction")}
            </button>
            <button type="submit" disabled={isLoading || !draft.ready} onClick={() => { saveAnotherRef.current = true; }} className="w-full border border-primary text-primary py-3 rounded-xl font-semibold">
              {language === "ar" ? "حفظ وإضافة أخرى · Ctrl+Enter" : "Save & add another · Ctrl+Enter"}
            </button>
            <button type="button" disabled={isLoading} onClick={() => draft.reset({ ...manualForm, amount: "", description: "", clientId: "", tripId: "", toAccountId: "", includedInOpeningBalance: "", destinationIncludedInOpeningBalance: "", date: localISODate() })} className="w-full text-sm text-muted-foreground py-2">{language === "ar" ? "مسودة جديدة (مسح الحقول)" : "New draft (clear fields)"}</button>
            <p className="text-xs text-muted-foreground">{language === "ar" ? "تُحفظ المسودة تلقائياً على هذا الجهاز" : "Draft saved automatically on this device"}</p>
            </fieldset>
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

            <div className="space-y-3">
              <div>
                <label htmlFor="new-transaction-field-9" className="text-xs font-medium text-muted-foreground mb-1 block">
                  {language === "ar" ? "نوع العملية" : "Type"}
                </label>
                <select id="new-transaction-field-9"
                  value={parsed?.type ?? "expense"}
                  onChange={(e) => { if(e.target.value === "receivable") { setLocation("/receivables"); return; } setParsed((p) => (p ? { ...p, type: e.target.value } : p)); }}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  data-testid="select-type-confirm"
                >
                  <option value="income">{t("typeIncome")}</option>
                  <option value="expense">{t("typeExpense")}</option>
                  <option value="transfer">{t("typeTransfer")}</option>
                  <option value="receivable">{t("receivables")}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="new-transaction-field-10" className="text-xs font-medium text-muted-foreground mb-1 block">
                    {language === "ar" ? "المبلغ" : "Amount"}
                  </label>
                  <input id="new-transaction-field-10"
                    type="number"
                    value={parsed?.amount ?? ""}
                    onChange={(e) => setParsed((p) => (p ? { ...p, amount: e.target.value === "" ? null : normalizeAmountInput(e.target.value) } : p))}
                    placeholder="0.00"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm font-semibold text-primary bg-background"
                    data-testid="input-amount-confirm"
                  />
                </div>
                <div>
                  <label htmlFor="new-transaction-field-11" className="text-xs font-medium text-muted-foreground mb-1 block">
                    {language === "ar" ? "العملة" : "Currency"}
                  </label>
                  <select id="new-transaction-field-11"
                    value={parsed?.currency ?? settings.primaryCurrency}
                    onChange={(e) => setParsed((p) => (p ? { ...p, currency: e.target.value } : p))}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    data-testid="select-currency-confirm"
                  >
                    {settings.currencies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {parsed?.type !== "transfer" && (showClients || showTrips) && (
                <div className="grid grid-cols-2 gap-3">
                  {showClients && (
                    <div>
                      <label htmlFor="new-transaction-field-12" className="text-xs font-medium text-muted-foreground mb-1 block">{t("clientLabel")}</label>
                      <select id="new-transaction-field-12"
                        value={parsed?.clientId != null ? String(parsed.clientId) : ""}
                        onChange={(e) => {
                          const id = e.target.value ? Number(e.target.value) : null;
                          const c = clients?.find((cl) => cl.id === id);
                          setParsed((p) => (p ? { ...p, clientId: id, clientName: c ? c.name : null } : p));
                        }}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                        data-testid="select-client-confirm"
                      >
                        <option value="">{t("noClient")}</option>
                        {clients?.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                        {parsed?.clientName && parsed?.clientId == null && (
                          <option value="" disabled>
                            {language === "ar" ? `(جديد) ${parsed.clientName}` : `(new) ${parsed.clientName}`}
                          </option>
                        )}
                      </select>
                    </div>
                  )}
                  {showTrips && (
                    <div>
                      <label htmlFor="new-transaction-field-13" className="text-xs font-medium text-muted-foreground mb-1 block">{t("tripLabel")}</label>
                      <select id="new-transaction-field-13"
                        value={parsed?.tripId != null ? String(parsed.tripId) : ""}
                        onChange={(e) => {
                          const id = e.target.value ? Number(e.target.value) : null;
                          const tp = trips?.find((t) => t.id === id);
                          setParsed((p) => (p ? { ...p, tripId: id, tripName: tp ? tp.name : null } : p));
                        }}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                        data-testid="select-trip-confirm"
                      >
                        <option value="">{t("noTripOption")}</option>
                        {trips?.map((tp) => (
                          <option key={tp.id} value={tp.id}>{tp.name}</option>
                        ))}
                        {parsed?.tripName && parsed?.tripId == null && (
                          <option value="" disabled>
                            {language === "ar" ? `(جديدة) ${parsed.tripName}` : `(new) ${parsed.tripName}`}
                          </option>
                        )}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label htmlFor="new-transaction-field-14" className="text-xs font-medium text-muted-foreground mb-1 block">
                  {language === "ar" ? "الوصف" : "Description"}
                </label>
                <input id="new-transaction-field-14"
                  type="text"
                  value={parsed?.description ?? ""}
                  onChange={(e) => setParsed((p) => (p ? { ...p, description: e.target.value } : p))}
                  placeholder={language === "ar" ? "وصف اختياري" : "Optional description"}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  data-testid="input-description-confirm"
                />
              </div>

              <div>
                <label htmlFor="new-transaction-field-15" className="text-xs font-medium text-muted-foreground mb-1 block">{t("statusLabel")}</label>
                <select id="new-transaction-field-15" value={parsed?.status ?? "pending"} onChange={(e) => setParsed((p) => p ? { ...p, status: e.target.value as "pending" | "settled" } : p)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background" data-testid="select-status-confirm">
                  <option value="pending">{t("statusPending")}</option>
                  <option value="settled">{t("statusSettled")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="new-transaction-field-16" className="text-xs font-medium text-muted-foreground mb-1 block">
                  {language === "ar" ? "التاريخ" : "Date"}
                </label>
                <input id="new-transaction-field-16"
                  type="date"
                  value={parsed?.date ?? localISODate()}
                  onChange={(e) => setParsed((p) => (p ? { ...p, date: e.target.value } : p))}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  data-testid="input-date-confirm"
                />
              </div>
            </div>

            {/* Status indicators for client / trip */}
            {parsed?.type !== "transfer" && (parsed?.clientName || parsed?.tripName) && (
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
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {parsed?.type === "transfer"
                ? (language === "ar" ? "من حساب" : "From account")
                : (language === "ar" ? "الحساب/البطاقة" : "Account/Card")} <span className="text-destructive">*</span>
            </label>
            <div className="flex gap-2">
              <select
                value={manualForm.accountId}
                onChange={(e) => setManualForm({ ...manualForm, accountId: e.target.value })}
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
                data-testid="select-account-confirm"
                required
              >
                <option value="">{language === "ar" ? "اختر حساب..." : "Select account..."}</option>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatNumber(a.currentBalance, 2)} {a.currency})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => openAddAccount("accountId")}
                className="shrink-0 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted"
              >
                + {language === "ar" ? "جديد" : "New"}
              </button>
            </div>
            {showAddAccount && addAccountTarget === "accountId" && (
              <div className="mt-2">
                <AddAccountPanel
                  language={language}
                  newAccountName={newAccountName}
                  setNewAccountName={setNewAccountName}
                  newAccountType={newAccountType}
                  setNewAccountType={setNewAccountType}
                  onSave={handleAddAccount}
                  onCancel={() => setShowAddAccount(false)}
                  saving={createAccountMutation.isPending}
                />
              </div>
            )}
          </div>

          {parsed?.type === "transfer" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {language === "ar" ? "إلى حساب" : "To account"} <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <select
                  value={manualForm.toAccountId}
                  onChange={(e) => setManualForm({ ...manualForm, toAccountId: e.target.value })}
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  data-testid="select-to-account-confirm"
                  required
                >
                  <option value="">{language === "ar" ? "اختر حساب..." : "Select account..."}</option>
                  {accounts?.filter((a) => String(a.id) !== manualForm.accountId).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatNumber(a.currentBalance, 2)} {a.currency})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => openAddAccount("toAccountId")}
                  className="shrink-0 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted"
                >
                  + {language === "ar" ? "جديد" : "New"}
                </button>
              </div>
              {showAddAccount && addAccountTarget === "toAccountId" && (
                <div className="mt-2">
                  <AddAccountPanel
                    language={language}
                    newAccountName={newAccountName}
                    setNewAccountName={setNewAccountName}
                    newAccountType={newAccountType}
                    setNewAccountType={setNewAccountType}
                    onSave={handleAddAccount}
                    onCancel={() => setShowAddAccount(false)}
                    saving={createAccountMutation.isPending}
                  />
                </div>
              )}
            </div>
          )}

<OpeningBalanceOptions accounts={accounts} accountId={manualForm.accountId} toAccountId={manualForm.toAccountId} type={parsed?.type || manualForm.type} date={parsed?.date || manualForm.date} source={manualForm.includedInOpeningBalance} destination={manualForm.destinationIncludedInOpeningBalance} onSource={v=>setManualForm(f=>({...f,includedInOpeningBalance:v}))} onDestination={v=>setManualForm(f=>({...f,destinationIncludedInOpeningBalance:v}))} ar={language === "ar"}/>
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
              onClick={() => {
                if (!manualForm.accountId) {
                  toast({
                    title: language === "ar" ? "لازم تحدد الحساب" : "Account required",
                    description: language === "ar" ? "اختر من أي حساب أو بطاقة طلعت/دخلت المصاري" : "Choose which account/card this transaction went through",
                    variant: "destructive",
                  });
                  return;
                }
                handleConfirm();
              }}
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
