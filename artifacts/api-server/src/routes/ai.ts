import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactionsTable,
  clientsTable,
  tripsTable,
  studiosTable,
  studioExpensesTable,
} from "@workspace/db";
import { ParseVoiceInputBody, AiQueryBody, TranscribeVoiceBody } from "@workspace/api-zod";
import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenerativeAI(apiKey);
}

const CURRENCY_NORMALIZE: Record<string, string> = {
  // USD
  "usd": "USD", "dollar": "USD", "dollars": "USD",
  "دولار": "USD", "دولارات": "USD", "دولاراً": "USD", "us dollar": "USD", "us dollars": "USD",
  // AED
  "aed": "AED", "dirham": "AED", "dirhams": "AED", "dhs": "AED", "dh": "AED",
  "درهم": "AED", "دراهم": "AED", "درهم اماراتي": "AED", "درهم إماراتي": "AED",
  "درهم امارتي": "AED", "درهم اماراتية": "AED",
  // SYP
  "syp": "SYP", "syrian pound": "SYP", "syrian lira": "SYP",
  "ليرة": "SYP", "ليرات": "SYP", "ليرة سورية": "SYP", "ليرات سورية": "SYP",
  "ليره": "SYP", "ليره سورية": "SYP", "ليرة سوريه": "SYP",
  "pound": "SYP", "lira": "SYP",
  // SAR
  "sar": "SAR", "riyal": "SAR", "riyals": "SAR", "saudi riyal": "SAR",
  "ريال": "SAR", "ريالات": "SAR", "ريال سعودي": "SAR",
  // EUR
  "eur": "EUR", "euro": "EUR", "euros": "EUR",
  "يورو": "EUR",
  // GBP
  "gbp": "GBP", "pound sterling": "GBP", "british pound": "GBP",
  "جنيه": "GBP", "جنيه استرليني": "GBP",
  // TRY
  "try": "TRY", "lira turca": "TRY", "turkish lira": "TRY",
  "ليرة تركية": "TRY", "ليرة تركيه": "TRY",
};

/** Build a human-readable mapping hint list for a set of ISO currency codes */
function buildCurrencyHints(codes: string[]): string {
  const HINTS: Record<string, string> = {
    USD: '"دولار" أو "dollar" أو "dollars" → USD',
    AED: '"درهم" أو "dirham" أو "دراهم" → AED',
    SYP: '"ليرة" أو "ليرة سورية" أو "lira" أو "pound" → SYP',
    SAR: '"ريال" أو "ريال سعودي" أو "riyal" → SAR',
    EUR: '"يورو" أو "euro" → EUR',
    GBP: '"جنيه" أو "جنيه استرليني" أو "pound sterling" → GBP',
    TRY: '"ليرة تركية" أو "turkish lira" → TRY',
    KWD: '"دينار" أو "دينار كويتي" أو "kuwaiti dinar" → KWD',
    BHD: '"دينار بحريني" أو "bahraini dinar" → BHD',
    QAR: '"ريال قطري" أو "qatari riyal" → QAR',
    JOD: '"دينار أردني" أو "jordanian dinar" → JOD',
    EGP: '"جنيه مصري" أو "egyptian pound" → EGP',
    OMR: '"ريال عماني" أو "omani rial" → OMR',
    IRR: '"ريال إيراني" أو "iranian rial" → IRR',
    CNY: '"يوان" أو "yuan" أو "renminbi" أو "rmb" → CNY',
    INR: '"روبية" أو "rupee" → INR',
    RUB: '"روبل" أو "ruble" → RUB',
    CAD: '"دولار كندي" أو "canadian dollar" → CAD',
    AUD: '"دولار أسترالي" أو "australian dollar" → AUD',
    CHF: '"فرنك" أو "franc" أو "swiss franc" → CHF',
    NOK: '"كرونة نرويجية" أو "norwegian krone" → NOK',
    SEK: '"كرونة سويدية" أو "swedish krona" → SEK',
    DKK: '"كرونة دنماركية" أو "danish krone" → DKK',
    JPY: '"ين" أو "yen" → JPY',
    PKR: '"روبية باكستانية" أو "pakistani rupee" → PKR',
    LBP: '"ليرة لبنانية" أو "lebanese pound" → LBP',
    IQD: '"دينار عراقي" أو "iraqi dinar" → IQD',
    LYD: '"دينار ليبي" أو "libyan dinar" → LYD',
    DZD: '"دينار جزائري" أو "algerian dinar" → DZD',
    MAD: '"درهم مغربي" أو "moroccan dirham" → MAD',
    TND: '"دينار تونسي" أو "tunisian dinar" → TND',
    YER: '"ريال يمني" أو "yemeni rial" → YER',
    SDG: '"جنيه سوداني" أو "sudanese pound" → SDG',
  };
  return codes.map((c) => HINTS[c] ?? `→ ${c}`).join("\n");
}

function normalizeCurrency(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const key = raw.trim().toLowerCase();
  return CURRENCY_NORMALIZE[key] ?? raw.trim().toUpperCase();
}

function isDailyQuotaExceeded(err: unknown): boolean {
  const msg = (err as { message?: string })?.message ?? "";
  return (
    msg.includes("PerDay") ||
    msg.includes("per_day") ||
    msg.includes("GenerateRequestsPerDayPerProjectPerModel") ||
    (msg.includes("limit: 0") && msg.includes("429"))
  );
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 429 && isDailyQuotaExceeded(err)) throw err;
      const isRetryable = status === 503 || status === 429;
      if (!isRetryable || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs * attempt));
    }
  }
  throw new Error("Unreachable");
}

type TxRow = {
  id: number;
  date: string;
  type: string;
  amount: string;
  currency: string;
  clientId: number | null;
  tripId: number | null;
  description: string | null;
  status: string;
};

type ClientRow = { id: number; name: string; phone: string | null };
type TripRow   = { id: number; name: string; status: string; isShared: boolean };
type StudioRow = { id: number; name: string };
type ExpenseRow = { studioId: number; category: string; amount: string; currency: string; date: string; notes: string | null };

function buildFinancialContext(
  txs: TxRow[],
  clients: ClientRow[],
  trips: TripRow[],
  studios: StudioRow[],
  expenses: ExpenseRow[],
): string {
  const clientMap = new Map(clients.map((c) => [c.id, c.name]));
  const tripMap   = new Map(trips.map((t) => [t.id, t.name]));

  const currencies = [...new Set(["AED", "USD", "SYP", ...txs.map((t) => t.currency)])];

  const overallBalances = currencies.map((cur) => {
    const cTxs = txs.filter((t) => t.currency === cur);
    const income   = cTxs.filter((t) => t.type === "income"  || t.type === "receipt").reduce((s, t) => s + Number(t.amount), 0);
    const spending = cTxs.filter((t) => t.type === "expense" || t.type === "payment").reduce((s, t) => s + Number(t.amount), 0);
    return { cur, balance: income - spending, income, spending };
  }).filter((b) => b.income !== 0 || b.spending !== 0);

  const clientSummaries = clients.map((client) => {
    const cTxs = txs.filter((t) => t.clientId === client.id);
    const perCur = currencies.map((cur) => {
      const curTxs = cTxs.filter((t) => t.currency === cur);
      const received = curTxs.filter((t) => t.type === "income"  || t.type === "receipt").reduce((s, t) => s + Number(t.amount), 0);
      const paid     = curTxs.filter((t) => t.type === "expense" || t.type === "payment").reduce((s, t) => s + Number(t.amount), 0);
      return { cur, received, paid, open: received - paid };
    }).filter((c) => c.received !== 0 || c.paid !== 0);
    return { name: client.name, phone: client.phone, perCur, txCount: cTxs.length };
  });

  const tripSummaries = trips.map((trip) => {
    const tTxs = txs.filter((t) => t.tripId === trip.id);
    const perCur = currencies.map((cur) => {
      const curTxs = tTxs.filter((t) => t.currency === cur);
      const income   = curTxs.filter((t) => t.type === "income"  || t.type === "receipt").reduce((s, t) => s + Number(t.amount), 0);
      const spending = curTxs.filter((t) => t.type === "expense" || t.type === "payment").reduce((s, t) => s + Number(t.amount), 0);
      const net      = income - spending;
      const myShare  = trip.isShared ? net / 2 : net;
      return { cur, income, spending, net, myShare };
    }).filter((c) => c.income !== 0 || c.spending !== 0);
    return { name: trip.name, status: trip.status, isShared: trip.isShared, perCur, txCount: tTxs.length };
  });

  const studioSummaries = studios.map((studio) => {
    const sExp = expenses.filter((e) => e.studioId === studio.id);
    const perCur = currencies.map((cur) => {
      const total = sExp.filter((e) => e.currency === cur).reduce((s, e) => s + Number(e.amount), 0);
      return { cur, total };
    }).filter((c) => c.total !== 0);
    const details = sExp.map((e) => `${e.date} ${e.category} ${Number(e.amount).toFixed(2)} ${e.currency}${e.notes ? ` (${e.notes})` : ""}`);
    return { name: studio.name, perCur, details };
  });

  const lines: string[] = [];
  const today = new Date().toLocaleDateString("ar-AE", { dateStyle: "full" });
  lines.push(`تاريخ اليوم: ${today}`);
  lines.push(`إجمالي المعاملات: ${txs.length} | معلّقة: ${txs.filter((t) => t.status === "pending").length} | مسدّدة: ${txs.filter((t) => t.status === "settled").length}`);
  lines.push("");

  lines.push("=== الأرصدة الإجمالية ===");
  if (overallBalances.length === 0) {
    lines.push("لا توجد معاملات بعد");
  } else {
    overallBalances.forEach((b) => {
      lines.push(`${b.cur}: رصيد ${b.balance.toFixed(2)} | إجمالي دخل ${b.income.toFixed(2)} | إجمالي مصاريف ${b.spending.toFixed(2)}`);
    });
  }
  lines.push("");

  lines.push(`=== الزبائن (${clients.length}) ===`);
  clientSummaries.forEach((c) => {
    const balStr = c.perCur.length > 0
      ? c.perCur.map((b) => `${b.cur}: مستحق ${b.open >= 0 ? "لك" : "عليك"} ${Math.abs(b.open).toFixed(2)} (مقبوض ${b.received.toFixed(2)}, مدفوع ${b.paid.toFixed(2)})`).join(" | ")
      : "لا توجد معاملات";
    lines.push(`• ${c.name}${c.phone ? ` [${c.phone}]` : ""}: ${balStr} — ${c.txCount} معاملة`);
  });
  if (clients.length === 0) lines.push("لا يوجد زبائن");
  lines.push("");

  lines.push(`=== الرحلات (${trips.length}) ===`);
  tripSummaries.forEach((t) => {
    const status = t.status === "active" ? "نشطة" : "مغلقة";
    const shared = t.isShared ? " مشتركة (الربح ÷ 2)" : "";
    lines.push(`• ${t.name} [${status}${shared}]:`);
    if (t.perCur.length > 0) {
      t.perCur.forEach((c) => {
        lines.push(`  ${c.cur}: دخل ${c.income.toFixed(2)}, مصاريف ${c.spending.toFixed(2)}, صافي ${c.net.toFixed(2)}${t.isShared ? `, حصتي ${c.myShare.toFixed(2)}` : ""}`);
      });
    } else {
      lines.push("  لا توجد معاملات لهذه الرحلة");
    }
  });
  if (trips.length === 0) lines.push("لا توجد رحلات");
  lines.push("");

  lines.push(`=== الاستديوهات (${studios.length}) ===`);
  studioSummaries.forEach((s) => {
    const totals = s.perCur.map((c) => `${c.cur}: ${c.total.toFixed(2)}`).join(", ");
    lines.push(`• ${s.name}: ${totals || "لا توجد مصاريف"}`);
    s.details.forEach((d) => lines.push(`  - ${d}`));
  });
  if (studios.length === 0) lines.push("لا توجد استديوهات");
  lines.push("");

  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150);
  lines.push(`=== سجل المعاملات (${sorted.length} من ${txs.length}) ===`);
  sorted.forEach((t) => {
    const typeAr = t.type === "income" ? "دخل" : t.type === "expense" ? "مصروف" : t.type === "payment" ? "دفعة" : "قبض";
    const parts: string[] = [`[${t.date}]`, typeAr, `${Number(t.amount).toFixed(2)} ${t.currency}`];
    if (t.clientId && clientMap.has(t.clientId)) parts.push(`زبون:${clientMap.get(t.clientId)}`);
    if (t.tripId   && tripMap.has(t.tripId))     parts.push(`رحلة:${tripMap.get(t.tripId)}`);
    if (t.description) parts.push(`"${t.description}"`);
    parts.push(t.status === "pending" ? "[معلّق]" : "[مسدّد]");
    lines.push(parts.join(" "));
  });

  return lines.join("\n");
}

router.post("/ai/parse-voice", requireAuth, async (req, res): Promise<void> => {
  const parsed = ParseVoiceInputBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { text, currencies: clientCurrencies, primaryCurrency: clientPrimaryCurrency } = parsed.data;

  // Build active currencies list: prefer client-provided list, fallback to defaults
  const DEFAULT_CURRENCIES = ["AED", "USD", "SYP"];
  const activeCurrencies: string[] = (clientCurrencies && clientCurrencies.length > 0)
    ? clientCurrencies.map((c) => c.trim().toUpperCase())
    : DEFAULT_CURRENCIES;
  // Use the client's preferred currency as default; fall back to first in the active list
  const normalizedClientPrimary = clientPrimaryCurrency?.trim().toUpperCase();
  const primaryCurrency = (normalizedClientPrimary && activeCurrencies.includes(normalizedClientPrimary))
    ? normalizedClientPrimary
    : activeCurrencies[0];

  try {
    const [clients, trips, studios] = await Promise.all([
      db.select().from(clientsTable).where(eq(clientsTable.userId, req.userId)),
      db.select().from(tripsTable).where(eq(tripsTable.userId, req.userId)),
      db.select().from(studiosTable).where(eq(studiosTable.userId, req.userId)),
    ]);

    const clientList = (clients as ClientRow[]).map((c) => `  - id:${c.id} | ${c.name}`).join("\n") || "  (لا يوجد)";
    const tripList = (trips as TripRow[]).map((t) => `  - id:${t.id} | ${t.name}`).join("\n") || "  (لا يوجد)";
    const studioList = (studios as StudioRow[]).map((s) => `  - id:${s.id} | ${s.name}`).join("\n") || "  (لا يوجد)";

    // Build dynamic currency hint lines
    const currencyHints = buildCurrencyHints(activeCurrencies);

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `أنت مساعد مالي ذكي ثنائي اللغة (عربي/إنجليزي). حلّل الجملة التالية واستخرج بيانات العملية المالية.

الجملة قد تكون بالعربية أو بالإنجليزية أو خليطاً بينهما، وقد تحتوي أرقاماً بأي لغة. افهم المعنى مهما كانت اللغة.

الجملة: "${text}"

=== الزبائن الموجودون ===
${clientList}

=== الرحلات الموجودة ===
${tripList}

=== الاستديوهات الموجودة ===
${studioList}

--- قواعد مطابقة الأسماء ---
- طابق أي اسم مذكور مع القوائم أعلاه حتى لو اختلفت اللغة أو الكتابة (مثلاً "رشا" = "Rasha"، "studio noor" = "استديو النور"، "دبي" = "Dubai"). اعتمد على النطق لا المطابقة الحرفية.
- عند وجود تطابق: أعِد المعرّف الرقمي في clientId/tripId/studioId والاسم المخزَّن بالضبط في clientName/tripName/studioName.
- عند عدم وجود تطابق: المعرّف = null والاسم كما نُطق.
- إذا لم يُذكر اسم: الاسم والمعرّف = null.

--- قواعد تحديد نوع العملية (type) — اقرأ بعناية ---

expense (مصروف شخصي أو تشغيلي — لا يوجد مستلم شخصي محدد):
  يُستخدم عندما يذهب المال إلى شيء أو جهة عامة أو خدمة، وليس إلى شخص بعينه.
  أمثلة: فاتورة كهرباء، فاتورة ماء، إيجار بيت أو مكتب، طعام، بنزين، مواصلات، تسوق عام، رواتب موظفين، صيانة، اشتراك، دواء، أي مصروف منزلي أو يومي.
  العلامة الفارقة: لا يوجد شخص/زبون يستلم هذا المبلغ مباشرةً.

payment (دفع لشخص أو زبون محدد — يوجد مستلم شخصي):
  يُستخدم عندما يذهب المال إلى شخص/زبون بالاسم، أو تُدفع أغراض أو بضاعة أو خدمة باسم شخص محدد.
  أمثلة: "دفعت ٥٠٠ لأحمد"، "دفعت حق بضاعة لرشا"، "سددت لمحمد"، "دفعت أغراض لسامي"، "دفعت حق شغل فلان".
  العلامة الفارقة: يوجد اسم شخص أو زبون يستلم أو يستفيد من الدفع مباشرةً.

income (دخل/إيراد عام — لا يوجد دافع شخصي محدد):
  دخول مال من مصدر عام كالبيع أو الأرباح أو الإيراد التجاري.

receipt (قبض من شخص محدد — يوجد دافع شخصي):
  استلام مبلغ من شخص/زبون بالاسم. مثل: "قبضت ٣٠٠ من سامي"، "استلمت من أحمد".

⚠️ قاعدة التمييز الأساسية:
  هل يوجد شخص/زبون محدد يدفع أو يستلم هذا المبلغ؟
  - نعم + المال خارج منك → payment
  - نعم + المال داخل إليك → receipt
  - لا + المال خارج منك → expense
  - لا + المال داخل إليك → income

--- قواعد العملة (مهم جداً) ---
العملات المفعّلة في هذا الحساب: ${activeCurrencies.join(", ")}
- أعِد العملة دائماً ككود ISO من القائمة أعلاه بالأحرف الكبيرة فقط.
- لا تكتب اسم العملة بالعربية أو الإنجليزية مطلقاً.
- خريطة التحويل للعملات المفعّلة:
${currencyHints}
- إذا لم تُذكر عملة في الجملة، استخدم "${primaryCurrency}" كافتراضي.
- إذا ذُكرت عملة غير موجودة في القائمة، اختر الأقرب إليها من القائمة.

--- قواعد الوصف ---
- اكتب وصفاً موجزاً لا يتجاوز 5 كلمات بنفس لغة الجملة الغالبة.
- لا تكرر أي كلمة في الوصف.
- لا تضف كلمات زائدة أو توضيحات غير ضرورية.

أعِد JSON فقط بدون أي نص خارجه:
{"type":"...","amount":0,"currency":"${primaryCurrency}","clientName":null,"clientId":null,"tripName":null,"tripId":null,"studioName":null,"studioId":null,"detectedLanguage":"...","description":"..."}

أمثلة:
جملة: "دفعت فاتورة الكهرباء ٣٠٠ درهم" → type: expense (لا يوجد مستلم شخصي)
جملة: "دفعت ٥٠٠ لأحمد" → type: payment (أحمد مستلم شخصي)
جملة: "دفعت أغراض لرشا بـ٢٠٠" → type: payment (رشا مستفيدة مباشرة)
جملة: "دفعت إيجار الشقة" → type: expense (لا يوجد مستلم شخصي)
جملة: "قبضت ١٠٠٠ من سامي" → type: receipt`;

    const result = await withRetry(() => model.generateContent(prompt));
    const responseText = result.response.text().trim();

    let jsonText = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonText = jsonMatch[1].trim();

    let parsedResult: Record<string, unknown> = {};
    try {
      parsedResult = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      res.json({ success: false, error: "فشل تحليل النص", rawText: text });
      return;
    }

    const toId = (v: unknown, valid: Set<number>): number | null => {
      const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
      return Number.isInteger(n) && valid.has(n) ? n : null;
    };
    const clientIds = new Set((clients as ClientRow[]).map((c) => c.id));
    const tripIds = new Set((trips as TripRow[]).map((t) => t.id));
    const studioIds = new Set((studios as StudioRow[]).map((s) => s.id));

    const normalizedCurrency = normalizeCurrency(parsedResult.currency);
    // Prefer a currency in the user's active list; fall back to primary
    const finalCurrency = normalizedCurrency && activeCurrencies.includes(normalizedCurrency)
      ? normalizedCurrency
      : (normalizedCurrency ?? primaryCurrency);

    res.json({
      success: true,
      type: (parsedResult.type as string) || null,
      amount: (parsedResult.amount as number) || null,
      currency: finalCurrency,
      clientName: (parsedResult.clientName as string) || null,
      clientId: toId(parsedResult.clientId, clientIds),
      tripName: (parsedResult.tripName as string) || null,
      tripId: toId(parsedResult.tripId, tripIds),
      studioName: (parsedResult.studioName as string) || null,
      studioId: toId(parsedResult.studioId, studioIds),
      detectedLanguage: (parsedResult.detectedLanguage as string) || null,
      description: (parsedResult.description as string) || null,
      rawText: text,
    });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      const isDaily = isDailyQuotaExceeded(err);
      req.log.warn({ err }, "Gemini quota exceeded");
      res.status(429).json({
        error: "quota_exceeded",
        message: isDaily
          ? "انتهت حصة الذكاء الاصطناعي لهذا اليوم، تُجدَّد الحصة غداً"
          : "الذكاء الاصطناعي مشغول حالياً، جرب بعد قليل",
      });
      return;
    }
    req.log.error({ err }, "Failed to parse voice input");
    res.status(500).json({ error: "فشل تحليل الإدخال الصوتي" });
  }
});

router.post("/ai/transcribe-voice", requireAuth, async (req, res): Promise<void> => {
  const parsed = TranscribeVoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { audioBase64, mimeType } = parsed.data;

  try {
    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `حوّل المقطع الصوتي التالي إلى نص مكتوب بدقة. المتحدث قد يتكلم بالعربية أو الإنجليزية أو خليطاً بينهما، وقد يذكر أرقاماً ومبالغ وأسماء. أعد النص المنطوق فقط بدون أي شرح أو علامات اقتباس أو نص إضافي.`;

    const result = await withRetry(() =>
      model.generateContent([
        { inlineData: { data: audioBase64, mimeType } },
        { text: prompt },
      ]),
    );
    const text = result.response.text().trim();

    if (!text) {
      res.json({ success: false, error: "لم يتم التعرف على أي كلام" });
      return;
    }

    res.json({ success: true, text });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      const isDaily = isDailyQuotaExceeded(err);
      req.log.warn({ err }, "Gemini quota exceeded");
      res.status(429).json({
        error: "quota_exceeded",
        message: isDaily
          ? "انتهت حصة الذكاء الاصطناعي لهذا اليوم، تُجدَّد الحصة غداً"
          : "الذكاء الاصطناعي مشغول حالياً، جرب بعد قليل",
      });
      return;
    }
    req.log.error({ err }, "Failed to transcribe voice");
    res.status(500).json({ error: "فشل تحويل الصوت إلى نص" });
  }
});

router.post("/ai/query", requireAuth, async (req, res): Promise<void> => {
  const parsed = AiQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { question, history = [] } = parsed.data;

  try {
    const [txs, clients, trips, studios, expenses] = await Promise.all([
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, req.userId)),
      db.select().from(clientsTable).where(eq(clientsTable.userId, req.userId)),
      db.select().from(tripsTable).where(eq(tripsTable.userId, req.userId)),
      db.select().from(studiosTable).where(eq(studiosTable.userId, req.userId)),
      db.select().from(studioExpensesTable).where(eq(studioExpensesTable.userId, req.userId)),
    ]);

    const context = buildFinancialContext(
      txs as TxRow[],
      clients as ClientRow[],
      trips as TripRow[],
      studios as StudioRow[],
      expenses as ExpenseRow[],
    );

    const systemInstruction = `أنت مساعد مالي ذكي لتاجر يعمل بين الإمارات والولايات المتحدة وسوريا.
مهمتك الإجابة على الأسئلة المالية بدقة بناءً على البيانات الحالية المقدمة.
- أجب دائماً بالعربية بشكل موجز وواضح
- استخدم الأرقام الفعلية من البيانات دون تقريب كبير
- إذا كان السؤال عن معلومة غير موجودة، قل ذلك بوضوح
- يمكنك الإجابة على أسئلة مثل: الأرصدة، ذمم الزبائن، أرباح الرحلات، مصاريف الاستديوهات، المعاملات المعلقة، مقارنات، وأي تحليل مالي

البيانات المالية الحالية:
${context}`;

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction,
    });

    const chatHistory: Content[] = (history ?? [])
      .filter((_, i, arr) => {
        if (i === 0 && arr[0].role !== "user") return false;
        return true;
      })
      .map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

    const chat = model.startChat({ history: chatHistory });
    const result = await withRetry(() => chat.sendMessage(question));
    const answer = result.response.text();

    res.json({ answer, data: { totalTransactions: txs.length, clientCount: clients.length } });
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status;
    if (status === 429) {
      const isDaily = isDailyQuotaExceeded(err);
      req.log.warn({ err }, "Gemini quota exceeded");
      res.status(429).json({
        error: "quota_exceeded",
        message: isDaily
          ? "انتهت حصة الذكاء الاصطناعي لهذا اليوم، تُجدَّد الحصة غداً"
          : "الذكاء الاصطناعي مشغول حالياً، جرب بعد قليل",
      });
      return;
    }
    req.log.error({ err }, "Failed to process AI query");
    res.status(500).json({ error: "فشل معالجة الاستعلام" });
  }
});

export default router;
