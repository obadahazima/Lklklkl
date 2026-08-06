import { Router } from "express";
import { db } from "@workspace/db";
import {
  transactionsTable,
  clientsTable,
  tripsTable,
  studiosTable,
  studioExpensesTable,
  aiMessagesTable,
} from "@workspace/db";
import { ParseVoiceInputBody, AiQueryBody, TranscribeVoiceBody } from "@workspace/api-zod";
import { GoogleGenerativeAI, SchemaType, type Content, type FunctionDeclaration } from "@google/generative-ai";
import { eq, and, asc, desc, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

// The conversation is kept to a rolling window of this many stored messages per user (user +
// model turns combined) — once it grows past this, the oldest messages are dropped (FIFO) after
// each exchange. Keeps both the DB row count and the model's context window bounded for
// long-running users, while still preserving a generous, ~30-turn recent history.
const MAX_STORED_MESSAGES = 60;

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

/** Format a Date as YYYY-MM-DD (local calendar day, no timezone drift). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Deterministic, regex-based date extractor. Runs independently of Gemini so that if the
 * model fails to return (or mis-formats) a date, we still catch common Levantine Arabic
 * and English time expressions ourselves.
 */
function extractDateFallback(text: string, today: Date): string | null {
  const t = text.trim();
  const dayMs = 24 * 60 * 60 * 1000;
  const addDays = (n: number) => new Date(today.getTime() + n * dayMs);

  const arNumWords: Record<string, number> = {
    "يومين": 2, "يومان": 2, "ثلاثة أيام": 3, "تلاتة أيام": 3, "أربعة أيام": 4,
    "اربعة أيام": 4, "خمسة أيام": 5,
  };
  let m = t.match(/قبل\s+(\d+)\s*(?:يوم|أيام)/);
  if (m) return toISODate(addDays(-Number(m[1])));
  for (const [phrase, n] of Object.entries(arNumWords)) {
    if (t.includes(`قبل ${phrase}`)) return toISODate(addDays(-n));
  }
  m = t.match(/(\d+)\s+days?\s+ago/i);
  if (m) return toISODate(addDays(-Number(m[1])));

  if (/أول\s*(?:أمس|امبارح|إمبارح|مبارح)|day before yesterday/i.test(t)) {
    return toISODate(addDays(-2));
  }

  if (/(?:^|[^أ\p{L}])(أمس|امبارح|إمبارح|مبارح)(?:$|[^\p{L}])/u.test(t) || /\byesterday\b/i.test(t)) {
    return toISODate(addDays(-1));
  }

  if (/الأسبوع\s+(?:الماضي|اللي فات|السابق)|last week/i.test(t)) {
    return toISODate(addDays(-7));
  }

  if (/(?:^|[^\p{L}])اليوم(?:$|[^\p{L}])/u.test(t) || /\btoday\b/i.test(t)) {
    return toISODate(today);
  }

  const arWeekdays: Record<string, number> = {
    "الأحد": 0, "الاحد": 0, "الإثنين": 1, "الاثنين": 1, "الثلاثاء": 2, "الثلاثا": 2,
    "الأربعاء": 3, "الاربعاء": 3, "الخميس": 4, "الجمعة": 5, "الجمعه": 5, "السبت": 6,
  };
  for (const [name, dow] of Object.entries(arWeekdays)) {
    if (t.includes(name)) {
      const diff = (today.getDay() - dow + 7) % 7;
      return toISODate(addDays(-diff));
    }
  }
  const enWeekdays: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  const wdMatch = t.toLowerCase().match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wdMatch) {
    const dow = enWeekdays[wdMatch[1]];
    const diff = (today.getDay() - dow + 7) % 7;
    return toISODate(addDays(-diff));
  }

  // Arabic-Indic digits -> Western digits
  const western = t.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));

  m = western.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = m[3] ? Number(m[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const d = new Date(year, month - 1, day);
      if (d.getMonth() === month - 1) return toISODate(d);
    }
  }

  m = western.match(/(?:بتاريخ|يوم)\s+(\d{1,2})(?!\s*[\/\-]\s*\d)/);
  if (!m) m = western.match(/(\d{1,2})\s+الشهر/);
  if (m) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d.getMonth() === today.getMonth()) return toISODate(d);
    }
  }

  const enMonths: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
    august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  const monthMatch = western.toLowerCase().match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
  );
  if (monthMatch) {
    const month = enMonths[monthMatch[1]];
    const day = Number(monthMatch[2]);
    if (day >= 1 && day <= 31) return toISODate(new Date(today.getFullYear(), month, day));
  }

  return null;
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
type ExpenseRow = { id: number; studioId: number; category: string; amount: string; currency: string; date: string; notes: string | null };

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
    return { id: client.id, name: client.name, phone: client.phone, perCur, txCount: cTxs.length };
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
    return { id: trip.id, name: trip.name, status: trip.status, isShared: trip.isShared, perCur, txCount: tTxs.length };
  });

  const studioSummaries = studios.map((studio) => {
    const sExp = expenses.filter((e) => e.studioId === studio.id);
    const perCur = currencies.map((cur) => {
      const total = sExp.filter((e) => e.currency === cur).reduce((s, e) => s + Number(e.amount), 0);
      return { cur, total };
    }).filter((c) => c.total !== 0);
    const details = sExp.map((e) => `#${e.id} ${e.date} ${e.category} ${Number(e.amount).toFixed(2)} ${e.currency}${e.notes ? ` (${e.notes})` : ""}`);
    return { id: studio.id, name: studio.name, perCur, details };
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
    lines.push(`• #${c.id} ${c.name}${c.phone ? ` [${c.phone}]` : ""}: ${balStr} — ${c.txCount} معاملة`);
  });
  if (clients.length === 0) lines.push("لا يوجد زبائن");
  lines.push("");

  lines.push(`=== الرحلات (${trips.length}) ===`);
  tripSummaries.forEach((t) => {
    const status = t.status === "active" ? "نشطة" : "مغلقة";
    const shared = t.isShared ? " مشتركة (الربح ÷ 2)" : "";
    lines.push(`• #${t.id} ${t.name} [${status}${shared}]:`);
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
    lines.push(`• #${s.id} ${s.name}: ${totals || "لا توجد مصاريف"}`);
    s.details.forEach((d) => lines.push(`  - ${d}`));
  });
  if (studios.length === 0) lines.push("لا توجد استديوهات");
  lines.push("");

  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150);
  lines.push(`=== سجل المعاملات (${sorted.length} من ${txs.length}) ===`);
  sorted.forEach((t) => {
    const typeAr = t.type === "income" ? "دخل" : t.type === "expense" ? "مصروف" : t.type === "payment" ? "دفعة" : "قبض";
    const parts: string[] = [`#${t.id}`, `[${t.date}]`, typeAr, `${Number(t.amount).toFixed(2)} ${t.currency}`];
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

    const todayISO = new Date().toISOString().split("T")[0];
    const todayHuman = new Date().toLocaleDateString("ar-AE", { dateStyle: "full" });

    const prompt = `أنت مساعد مالي ذكي ثنائي اللغة (عربي/إنجليزي). حلّل الجملة التالية واستخرج بيانات العملية المالية.

الجملة قد تكون بالعربية أو بالإنجليزية أو خليطاً بينهما، وقد تحتوي أرقاماً بأي لغة. افهم المعنى مهما كانت اللغة.

تاريخ اليوم هو: ${todayISO} (${todayHuman})

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

--- قواعد التاريخ (مهم جداً) ---
- إذا ذكرت الجملة تاريخاً أو إشارة زمنية للمعاملة (مثل: "أمس"، "اليوم"، "أول أمس"، "قبل يومين"، "الأسبوع الماضي"، "بتاريخ ١٥/٧"، "يوم الاثنين الماضي"، "on July 15th"، "last Monday"، "yesterday")، احسب التاريخ الفعلي بالاعتماد على تاريخ اليوم (${todayISO}) وأعده بصيغة YYYY-MM-DD في حقل "date".
- إذا ذُكر يوم من أيام الأسبوع بدون تحديد أنه الأسبوع الماضي أو القادم (مثل "يوم الأحد")، افترض أنه أقرب يوم أحد قبل اليوم (أو اليوم نفسه إذا كان اليوم هو نفس اليوم).
- إذا لم تُذكر أي إشارة زمنية إطلاقاً في الجملة، اجعل قيمة "date" هي null (وليس تاريخ اليوم) — الواجهة ستستخدم تاريخ اليوم تلقائياً في هذه الحالة.
- لا تخترع تاريخاً أبداً؛ التاريخ يُستخرج فقط إذا كان مذكوراً أو مفهوماً ضمنياً من الجملة بوضوح.

أعِد JSON فقط بدون أي نص خارجه:
{"type":"...","amount":0,"currency":"${primaryCurrency}","clientName":null,"clientId":null,"tripName":null,"tripId":null,"studioName":null,"studioId":null,"detectedLanguage":"...","description":"...","date":null}

أمثلة:
جملة: "دفعت فاتورة الكهرباء ٣٠٠ درهم" → type: expense (لا يوجد مستلم شخصي)، date: null (لا يوجد ذكر للتاريخ)
جملة: "دفعت ٥٠٠ لأحمد" → type: payment (أحمد مستلم شخصي)، date: null
جملة: "دفعت أغراض لرشا بـ٢٠٠" → type: payment (رشا مستفيدة مباشرة)
جملة: "دفعت إيجار الشقة" → type: expense (لا يوجد مستلم شخصي)
جملة: "قبضت ١٠٠٠ من سامي أمس" → type: receipt، date: التاريخ الفعلي ليوم أمس بصيغة YYYY-MM-DD
جملة: "قبضت ٥٠٠ من محمد بتاريخ ١٥/٧" → date: التاريخ ١٥ تموز من السنة الحالية بصيغة YYYY-MM-DD`;

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

    // Validate extracted date: must be a real, well-formed YYYY-MM-DD date, and not absurdly in the future/past.
    const rawDate = typeof parsedResult.date === "string" ? parsedResult.date.trim() : null;
    let finalDate: string | null = null;
    if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      const d = new Date(rawDate + "T00:00:00Z");
      if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === rawDate) {
        finalDate = rawDate;
      }
    }
    // Safety net: if Gemini didn't return a valid date, try to extract it ourselves via regex.
    // This is what actually fixes "مبارح" / "15 الشهر" / "15/7" being missed.
    if (!finalDate) {
      finalDate = extractDateFallback(text, new Date());
    }

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
      date: finalDate,
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

    const prompt = `حوّل المقطع الصوتي التالي إلى نص مكتوب بدقة. المتحدث قد يتكلم بالعربية أو الإنجليزية أو خليطاً بينهما، وقد يذكر أرقاماً ومبالغ وأسماء. أعد النص المنطوق فقط بدون أي شرح أو علامات اقتباس أو نص إضافي و لا تكرر الكلمات.`;

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

// --- Tools the AI assistant is allowed to execute against the user's own data ---

const createTransactionDeclaration: FunctionDeclaration = {
  name: "create_transaction",
  description:
    "أضف معاملة مالية جديدة (دخل، مصروف، دفعة لزبون، أو قبض من زبون). استخدمها فقط عندما يطلب المستخدم صراحةً إضافة/تسجيل معاملة.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      type: { type: SchemaType.STRING, format: "enum", enum: ["income", "expense", "payment", "receipt"], description: "نوع المعاملة" },
      amount: { type: SchemaType.NUMBER, description: "المبلغ (رقم موجب)" },
      currency: { type: SchemaType.STRING, description: "كود العملة ISO مثل AED أو USD أو SYP" },
      date: { type: SchemaType.STRING, description: "تاريخ المعاملة بصيغة YYYY-MM-DD. إذا لم يُذكر تاريخ استخدم تاريخ اليوم." },
      clientId: { type: SchemaType.NUMBER, description: "معرّف الزبون إذا كانت المعاملة مرتبطة بزبون موجود (اختياري)" },
      tripId: { type: SchemaType.NUMBER, description: "معرّف الرحلة إذا كانت مرتبطة برحلة (اختياري)" },
      studioId: { type: SchemaType.NUMBER, description: "معرّف الاستديو إذا كانت مصروف استديو (اختياري)" },
      description: { type: SchemaType.STRING, description: "وصف موجز للمعاملة (اختياري)" },
      status: { type: SchemaType.STRING, format: "enum", enum: ["pending", "settled"], description: "حالة المعاملة، افتراضياً pending" },
    },
    required: ["type", "amount", "currency", "date"],
  },
};

const updateTransactionDeclaration: FunctionDeclaration = {
  name: "update_transaction",
  description:
    "عدّل معاملة موجودة بالفعل (غيّر المبلغ، التاريخ، الحالة، الوصف، إلخ). استخدمها فقط عندما يحدد المستخدم أي معاملة يقصد (برقمها id أو بوصف واضح يطابق سجل معاملات واحد بعينه من البيانات المتوفرة لك).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id: { type: SchemaType.NUMBER, description: "معرّف المعاملة (id) المطلوب تعديلها" },
      type: { type: SchemaType.STRING, format: "enum", enum: ["income", "expense", "payment", "receipt"] },
      amount: { type: SchemaType.NUMBER },
      currency: { type: SchemaType.STRING },
      date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
      clientId: { type: SchemaType.NUMBER },
      tripId: { type: SchemaType.NUMBER },
      description: { type: SchemaType.STRING },
      status: { type: SchemaType.STRING, format: "enum", enum: ["pending", "settled"] },
    },
    required: ["id"],
  },
};

const deleteTransactionDeclaration: FunctionDeclaration = {
  name: "delete_transaction",
  description:
    "احذف معاملة موجودة نهائياً. استخدمها فقط عندما يطلب المستخدم صراحةً حذف/إلغاء معاملة محددة، ويجب أن تكون متأكداً 100% من هوية المعاملة (id) قبل الحذف.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id: { type: SchemaType.NUMBER, description: "معرّف المعاملة (id) المطلوب حذفها" },
    },
    required: ["id"],
  },
};

const getOverdueClientsDeclaration: FunctionDeclaration = {
  name: "get_overdue_clients",
  description:
    "اجلب قائمة الزبائن اللي عندهم معاملات معلّقة (pending) من فترة، مرتّبة من الأكثر تأخراً. استخدمها عندما يسأل المستخدم عن الزبائن المتأخرين بالدفع أو الذمم المستحقة، أو عندما تحلل البيانات وتلاحظ تأخيراً وتريد اقتراح تذكير.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      minDaysOverdue: {
        type: SchemaType.NUMBER,
        description: "أقل عدد أيام تأخير لاعتبار الزبون متأخراً (افتراضياً 7)",
      },
    },
    required: [],
  },
};

const prepareWhatsappReminderDeclaration: FunctionDeclaration = {
  name: "prepare_whatsapp_reminder",
  description:
    "جهّز رسالة تذكير دفع لزبون معيّن ورابط واتساب جاهز لإرسالها (wa.me). لا يرسل الرسالة تلقائياً — فقط يجهّز الرابط والنص ليضغط المستخدم عليه بنفسه. استخدمها فقط بعد أن يوافق المستخدم صراحةً على إرسال تذكير لزبون محدد.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      clientId: { type: SchemaType.NUMBER, description: "معرّف الزبون" },
    },
    required: ["clientId"],
  },
};

const generateReportDeclaration: FunctionDeclaration = {
  name: "generate_report",
  description:
    "احسب تقريراً مالياً دقيقاً ومنظّماً لفترة محددة (دخل، مصاريف، صافي، أكبر بنود، ذمم معلّقة) بدل الاعتماد على تقدير نصي. استخدمها عندما يطلب المستخدم تقريراً أو ملخصاً مالياً لشهر أو فترة معينة.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate: { type: SchemaType.STRING, description: "بداية الفترة YYYY-MM-DD" },
      endDate: { type: SchemaType.STRING, description: "نهاية الفترة YYYY-MM-DD (شامل)" },
    },
    required: ["startDate", "endDate"],
  },
};

// --- Client tools ---

const createClientDeclaration: FunctionDeclaration = {
  name: "create_client",
  description:
    "أضف زبوناً جديداً. استخدمها إذا طلب المستخدم صراحةً إضافة زبون جديد، أو تلقائياً لما يُذكر اسم زبون بمعاملة ولا يوجد أي تطابق أو تشابه له بالبيانات الحالية (بدون الحاجة لسؤال إذن أولاً) — لكن لو الاسم قريب من زبون موجود أو في أكثر من احتمال، اسأل المستخدم أولاً قبل الاستدعاء.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: { type: SchemaType.STRING, description: "اسم الزبون" },
      phone: { type: SchemaType.STRING, description: "رقم هاتف الزبون (اختياري)، يفضَّل بصيغة دولية مثل 971501234567" },
      notes: { type: SchemaType.STRING, description: "ملاحظات عن الزبون (اختياري)" },
    },
    required: ["name"],
  },
};

const updateClientDeclaration: FunctionDeclaration = {
  name: "update_client",
  description: "عدّل بيانات زبون موجود (الاسم، الهاتف، أو الملاحظات).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id: { type: SchemaType.NUMBER, description: "معرّف الزبون (id)" },
      name: { type: SchemaType.STRING },
      phone: { type: SchemaType.STRING },
      notes: { type: SchemaType.STRING },
    },
    required: ["id"],
  },
};

const deleteClientDeclaration: FunctionDeclaration = {
  name: "delete_client",
  description:
    "احذف زبوناً نهائياً. إجراء لا رجعة فيه (معاملاته السابقة تبقى لكن تفقد ربطها بالزبون). استخدمها فقط بعد تأكيد صريح جداً من المستخدم لعملية الحذف تحديداً.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { id: { type: SchemaType.NUMBER, description: "معرّف الزبون (id)" } },
    required: ["id"],
  },
};

// --- Trip tools ---

const createTripDeclaration: FunctionDeclaration = {
  name: "create_trip",
  description:
    "أضف رحلة جديدة. استخدمها إذا طلب المستخدم صراحةً إضافة رحلة جديدة، أو تلقائياً لما يُذكر اسم رحلة بمعاملة ولا يوجد أي تطابق أو تشابه له بالبيانات الحالية (بدون الحاجة لسؤال إذن أولاً) — لكن لو الاسم قريب من رحلة موجودة أو في أكثر من احتمال، اسأل المستخدم أولاً قبل الاستدعاء.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: { type: SchemaType.STRING, description: "اسم الرحلة" },
      isShared: { type: SchemaType.BOOLEAN, description: "هل الرحلة مشتركة (الربح ÷ 2)؟ افتراضياً false" },
      status: { type: SchemaType.STRING, format: "enum", enum: ["active", "closed"], description: "حالة الرحلة، افتراضياً active" },
      notes: { type: SchemaType.STRING, description: "ملاحظات (اختياري)" },
    },
    required: ["name"],
  },
};

const updateTripDeclaration: FunctionDeclaration = {
  name: "update_trip",
  description: "عدّل بيانات رحلة موجودة (الاسم، الحالة، هل هي مشتركة، أو الملاحظات).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id: { type: SchemaType.NUMBER, description: "معرّف الرحلة (id)" },
      name: { type: SchemaType.STRING },
      isShared: { type: SchemaType.BOOLEAN },
      status: { type: SchemaType.STRING, format: "enum", enum: ["active", "closed"] },
      notes: { type: SchemaType.STRING },
    },
    required: ["id"],
  },
};

const deleteTripDeclaration: FunctionDeclaration = {
  name: "delete_trip",
  description:
    "احذف رحلة نهائياً. إجراء لا رجعة فيه (معاملاتها السابقة تبقى لكن تفقد ربطها بالرحلة). استخدمها فقط بعد تأكيد صريح جداً من المستخدم لعملية الحذف تحديداً.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { id: { type: SchemaType.NUMBER, description: "معرّف الرحلة (id)" } },
    required: ["id"],
  },
};

// --- Studio tools ---

const createStudioDeclaration: FunctionDeclaration = {
  name: "create_studio",
  description: "أضف استديو جديد. استخدمها إذا طلب المستخدم صراحةً إضافة استديو جديد، أو وافق على إضافة استديو غير موجود بالبيانات.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: { type: SchemaType.STRING, description: "اسم الاستديو" },
      address: { type: SchemaType.STRING, description: "العنوان (اختياري)" },
      notes: { type: SchemaType.STRING, description: "ملاحظات (اختياري)" },
    },
    required: ["name"],
  },
};

const updateStudioDeclaration: FunctionDeclaration = {
  name: "update_studio",
  description: "عدّل بيانات استديو موجود (الاسم، العنوان، أو الملاحظات).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      id: { type: SchemaType.NUMBER, description: "معرّف الاستديو (id)" },
      name: { type: SchemaType.STRING },
      address: { type: SchemaType.STRING },
      notes: { type: SchemaType.STRING },
    },
    required: ["id"],
  },
};

const deleteStudioDeclaration: FunctionDeclaration = {
  name: "delete_studio",
  description:
    "احذف استديو نهائياً — يحذف معه تلقائياً كل مصاريف هذا الاستديو المسجّلة (إجراء لا رجعة فيه). استخدمها فقط بعد تأكيد صريح جداً من المستخدم.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { id: { type: SchemaType.NUMBER, description: "معرّف الاستديو (id)" } },
    required: ["id"],
  },
};

const createStudioExpenseDeclaration: FunctionDeclaration = {
  name: "create_studio_expense",
  description: "سجّل مصروف استديو جديد (إيجار، صيانة، معدات، إلخ) على استديو موجود.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      studioId: { type: SchemaType.NUMBER, description: "معرّف الاستديو (id)" },
      category: { type: SchemaType.STRING, description: "تصنيف المصروف (مثلاً: إيجار، صيانة، معدات، كهرباء)" },
      amount: { type: SchemaType.NUMBER, description: "المبلغ (رقم موجب)" },
      currency: { type: SchemaType.STRING, description: "كود العملة ISO مثل AED أو USD" },
      date: { type: SchemaType.STRING, description: "تاريخ المصروف بصيغة YYYY-MM-DD. إذا لم يُذكر استخدم تاريخ اليوم." },
      notes: { type: SchemaType.STRING, description: "ملاحظات (اختياري)" },
    },
    required: ["studioId", "category", "amount", "currency", "date"],
  },
};

const deleteStudioExpenseDeclaration: FunctionDeclaration = {
  name: "delete_studio_expense",
  description: "احذف مصروف استديو معيّن نهائياً بالاعتماد على معرّفه (id) كما يظهر في سجل مصاريف الاستديو بالبيانات أعلاه.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: { id: { type: SchemaType.NUMBER, description: "معرّف مصروف الاستديو (id)" } },
    required: ["id"],
  },
};

// --- Search tool (precise, non-hallucinated lookup for edit/delete/explain requests) ---

const searchTransactionsDeclaration: FunctionDeclaration = {
  name: "search_transactions",
  description:
    "ابحث في كامل سجل المعاملات (ليس فقط آخر 150 المعروضة أعلاه بالبيانات) بأي مزيج من: اسم الزبون، اسم الرحلة، نطاق تاريخ، مبلغ تقريبي، كلمة من الوصف، النوع، أو الحالة. استخدمها دائماً قبل تعديل أو حذف معاملة وصفها المستخدم بالكلام بدل رقمها (id)، أو قبل الإجابة عن سؤال 'شو دفعت وليش' لمعاملة معينة، بدل أن تخمّن من السياق النصي.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      clientName: { type: SchemaType.STRING, description: "اسم الزبون كاملاً أو جزءاً منه (اختياري)" },
      tripName: { type: SchemaType.STRING, description: "اسم الرحلة كاملاً أو جزءاً منه (اختياري)" },
      dateFrom: { type: SchemaType.STRING, description: "بداية نطاق التاريخ YYYY-MM-DD (اختياري)" },
      dateTo: { type: SchemaType.STRING, description: "نهاية نطاق التاريخ YYYY-MM-DD شامل (اختياري)" },
      minAmount: { type: SchemaType.NUMBER, description: "أقل مبلغ (اختياري)" },
      maxAmount: { type: SchemaType.NUMBER, description: "أعلى مبلغ (اختياري)" },
      descriptionContains: { type: SchemaType.STRING, description: "كلمة أو جزء من وصف المعاملة (اختياري)" },
      type: { type: SchemaType.STRING, format: "enum", enum: ["income", "expense", "payment", "receipt"], description: "نوع المعاملة (اختياري)" },
      status: { type: SchemaType.STRING, format: "enum", enum: ["pending", "settled"], description: "حالة المعاملة (اختياري)" },
    },
    required: [],
  },
};

type ExecutedAction = { name: string; success: boolean; result: Record<string, unknown> };

async function executeTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const num = (v: unknown): number | undefined => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : undefined);

  if (name === "create_transaction") {
    const amount = num(args.amount);
    if (!amount || amount <= 0) return { error: "amount غير صالح" };
    if (typeof args.type !== "string" || typeof args.currency !== "string" || typeof args.date !== "string") {
      return { error: "حقول ناقصة (type/currency/date)" };
    }
    const [tx] = await db
      .insert(transactionsTable)
      .values({
        userId,
        type: args.type,
        amount: String(amount),
        currency: args.currency.toUpperCase(),
        date: args.date,
        status: (args.status as string) || "pending",
        description: (args.description as string) ?? null,
        clientId: num(args.clientId) ?? null,
        tripId: num(args.tripId) ?? null,
        studioId: num(args.studioId) ?? null,
      })
      .returning();
    return { success: true, transaction: { ...tx, amount: Number(tx.amount) } };
  }

  if (name === "update_transaction") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const updateData: Record<string, unknown> = {};
    if (typeof args.type === "string") updateData.type = args.type;
    const amount = num(args.amount);
    if (amount !== undefined) {
      if (amount <= 0) return { error: "amount غير صالح" };
      updateData.amount = String(amount);
    }
    if (typeof args.currency === "string") updateData.currency = args.currency.toUpperCase();
    if (typeof args.date === "string") updateData.date = args.date;
    if (typeof args.status === "string") updateData.status = args.status;
    if (typeof args.description === "string") updateData.description = args.description;
    const clientId = num(args.clientId);
    if (clientId !== undefined) updateData.clientId = clientId;
    const tripId = num(args.tripId);
    if (tripId !== undefined) updateData.tripId = tripId;

    const [tx] = await db
      .update(transactionsTable)
      .set(updateData)
      .where(and(eq(transactionsTable.id, id), eq(transactionsTable.userId, userId)))
      .returning();
    if (!tx) return { error: "المعاملة غير موجودة" };
    return { success: true, transaction: { ...tx, amount: Number(tx.amount) } };
  }

  if (name === "delete_transaction") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const deleted = await db
      .delete(transactionsTable)
      .where(and(eq(transactionsTable.id, id), eq(transactionsTable.userId, userId)))
      .returning();
    if (deleted.length === 0) return { error: "المعاملة غير موجودة" };
    return { success: true, deletedId: id };
  }

  if (name === "get_overdue_clients") {
    const minDays = num(args.minDaysOverdue) ?? 7;
    const today = new Date();
    const pending = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.userId, userId), eq(transactionsTable.status, "pending")));
    const clients = await db.select().from(clientsTable).where(eq(clientsTable.userId, userId));
    const clientMap = new Map((clients as ClientRow[]).map((c) => [c.id, c]));

    const byClient = new Map<number, { amounts: Map<string, number>; oldestDate: string }>();
    for (const t of pending as TxRow[]) {
      if (!t.clientId) continue;
      const entry = byClient.get(t.clientId) ?? { amounts: new Map<string, number>(), oldestDate: t.date };
      entry.amounts.set(t.currency, (entry.amounts.get(t.currency) ?? 0) + Number(t.amount));
      if (t.date < entry.oldestDate) entry.oldestDate = t.date;
      byClient.set(t.clientId, entry);
    }

    const overdueClients = [...byClient.entries()]
      .map(([clientId, entry]) => {
        const client = clientMap.get(clientId);
        if (!client) return null;
        const days = Math.floor((today.getTime() - new Date(entry.oldestDate).getTime()) / 86_400_000);
        return {
          clientId,
          clientName: client.name,
          phone: client.phone,
          daysOverdue: days,
          amounts: Object.fromEntries(entry.amounts),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.daysOverdue >= minDays)
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    return { success: true, overdueClients };
  }

  if (name === "prepare_whatsapp_reminder") {
    const clientId = num(args.clientId);
    if (!clientId) return { error: "clientId مفقود" };
    const [client] = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), eq(clientsTable.userId, userId)));
    if (!client) return { error: "الزبون غير موجود" };
    if (!client.phone) return { error: "لا يوجد رقم هاتف مسجّل لهذا الزبون، ما فيني جهّز رابط واتساب" };

    const pending = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          eq(transactionsTable.status, "pending"),
          eq(transactionsTable.clientId, clientId),
        ),
      );

    const amounts = new Map<string, number>();
    for (const t of pending as TxRow[]) {
      amounts.set(t.currency, (amounts.get(t.currency) ?? 0) + Number(t.amount));
    }
    const amountsStr =
      [...amounts.entries()].map(([cur, amt]) => `${amt.toFixed(2)} ${cur}`).join(" + ") || "0";

    const message = `مرحباً ${client.name}، تذكير ودّي بخصوص مبلغ مستحق قدره ${amountsStr}. يسعدنا نسددها بأقرب وقت يناسبك. شكراً لتعاملك معنا.`;
    const digitsOnly = client.phone.replace(/[^\d]/g, "");
    const whatsappLink = `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`;

    return { success: true, clientName: client.name, message, whatsappLink };
  }

  if (name === "generate_report") {
    const startDate = typeof args.startDate === "string" ? args.startDate : null;
    const endDate = typeof args.endDate === "string" ? args.endDate : null;
    if (!startDate || !endDate) return { error: "startDate/endDate مفقودة" };

    const [allTxs, clients] = await Promise.all([
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId)),
      db.select().from(clientsTable).where(eq(clientsTable.userId, userId)),
    ]);
    const clientMap = new Map((clients as ClientRow[]).map((c) => [c.id, c.name]));
    const inRange = (allTxs as TxRow[]).filter((t) => t.date >= startDate && t.date <= endDate);

    const byCurrency = new Map<string, { income: number; expense: number }>();
    for (const t of inRange) {
      const entry = byCurrency.get(t.currency) ?? { income: 0, expense: 0 };
      if (t.type === "income" || t.type === "receipt") entry.income += Number(t.amount);
      else entry.expense += Number(t.amount);
      byCurrency.set(t.currency, entry);
    }
    const totals = [...byCurrency.entries()].map(([currency, v]) => ({
      currency,
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

    const topExpenses = [...inRange]
      .filter((t) => t.type === "expense" || t.type === "payment")
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 5)
      .map((t) => ({
        date: t.date,
        amount: Number(t.amount),
        currency: t.currency,
        description: t.description,
        client: t.clientId ? (clientMap.get(t.clientId) ?? null) : null,
      }));

    return {
      success: true,
      period: { startDate, endDate },
      totals,
      transactionCount: inRange.length,
      pendingCount: inRange.filter((t) => t.status === "pending").length,
      topExpenses,
    };
  }

  // --- Clients ---

  if (name === "create_client") {
    const clientName = typeof args.name === "string" ? args.name.trim() : "";
    if (!clientName) return { error: "اسم الزبون مفقود" };
    const [client] = await db
      .insert(clientsTable)
      .values({
        userId,
        name: clientName,
        phone: typeof args.phone === "string" && args.phone.trim() ? args.phone.trim() : null,
        notes: typeof args.notes === "string" && args.notes.trim() ? args.notes.trim() : null,
      })
      .returning();
    return { success: true, client };
  }

  if (name === "update_client") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const updateData: Record<string, unknown> = {};
    if (typeof args.name === "string" && args.name.trim()) updateData.name = args.name.trim();
    if (typeof args.phone === "string") updateData.phone = args.phone.trim() || null;
    if (typeof args.notes === "string") updateData.notes = args.notes.trim() || null;
    const [client] = await db
      .update(clientsTable)
      .set(updateData)
      .where(and(eq(clientsTable.id, id), eq(clientsTable.userId, userId)))
      .returning();
    if (!client) return { error: "الزبون غير موجود" };
    return { success: true, client };
  }

  if (name === "delete_client") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const deleted = await db
      .delete(clientsTable)
      .where(and(eq(clientsTable.id, id), eq(clientsTable.userId, userId)))
      .returning();
    if (deleted.length === 0) return { error: "الزبون غير موجود" };
    return { success: true, deletedId: id };
  }

  // --- Trips ---

  if (name === "create_trip") {
    const tripName = typeof args.name === "string" ? args.name.trim() : "";
    if (!tripName) return { error: "اسم الرحلة مفقود" };
    const [trip] = await db
      .insert(tripsTable)
      .values({
        userId,
        name: tripName,
        isShared: typeof args.isShared === "boolean" ? args.isShared : false,
        status: (args.status as string) || "active",
        notes: typeof args.notes === "string" && args.notes.trim() ? args.notes.trim() : null,
      })
      .returning();
    return { success: true, trip };
  }

  if (name === "update_trip") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const updateData: Record<string, unknown> = {};
    if (typeof args.name === "string" && args.name.trim()) updateData.name = args.name.trim();
    if (typeof args.isShared === "boolean") updateData.isShared = args.isShared;
    if (typeof args.status === "string") updateData.status = args.status;
    if (typeof args.notes === "string") updateData.notes = args.notes.trim() || null;
    const [trip] = await db
      .update(tripsTable)
      .set(updateData)
      .where(and(eq(tripsTable.id, id), eq(tripsTable.userId, userId)))
      .returning();
    if (!trip) return { error: "الرحلة غير موجودة" };
    return { success: true, trip };
  }

  if (name === "delete_trip") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const deleted = await db
      .delete(tripsTable)
      .where(and(eq(tripsTable.id, id), eq(tripsTable.userId, userId)))
      .returning();
    if (deleted.length === 0) return { error: "الرحلة غير موجودة" };
    return { success: true, deletedId: id };
  }

  // --- Studios ---

  if (name === "create_studio") {
    const studioName = typeof args.name === "string" ? args.name.trim() : "";
    if (!studioName) return { error: "اسم الاستديو مفقود" };
    const [studio] = await db
      .insert(studiosTable)
      .values({
        userId,
        name: studioName,
        address: typeof args.address === "string" && args.address.trim() ? args.address.trim() : null,
        notes: typeof args.notes === "string" && args.notes.trim() ? args.notes.trim() : null,
      })
      .returning();
    return { success: true, studio };
  }

  if (name === "update_studio") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const updateData: Record<string, unknown> = {};
    if (typeof args.name === "string" && args.name.trim()) updateData.name = args.name.trim();
    if (typeof args.address === "string") updateData.address = args.address.trim() || null;
    if (typeof args.notes === "string") updateData.notes = args.notes.trim() || null;
    const [studio] = await db
      .update(studiosTable)
      .set(updateData)
      .where(and(eq(studiosTable.id, id), eq(studiosTable.userId, userId)))
      .returning();
    if (!studio) return { error: "الاستديو غير موجود" };
    return { success: true, studio };
  }

  if (name === "delete_studio") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const deleted = await db
      .delete(studiosTable)
      .where(and(eq(studiosTable.id, id), eq(studiosTable.userId, userId)))
      .returning();
    if (deleted.length === 0) return { error: "الاستديو غير موجود" };
    return { success: true, deletedId: id };
  }

  if (name === "create_studio_expense") {
    const studioId = num(args.studioId);
    const amount = num(args.amount);
    if (!studioId) return { error: "studioId مفقود" };
    if (!amount || amount <= 0) return { error: "amount غير صالح" };
    if (typeof args.category !== "string" || typeof args.currency !== "string" || typeof args.date !== "string") {
      return { error: "حقول ناقصة (category/currency/date)" };
    }
    const [studio] = await db
      .select()
      .from(studiosTable)
      .where(and(eq(studiosTable.id, studioId), eq(studiosTable.userId, userId)));
    if (!studio) return { error: "الاستديو غير موجود" };
    const [expense] = await db
      .insert(studioExpensesTable)
      .values({
        userId,
        studioId,
        category: args.category,
        amount: String(amount),
        currency: args.currency.toUpperCase(),
        date: args.date,
        notes: (args.notes as string) ?? null,
      })
      .returning();
    return { success: true, expense: { ...expense, amount: Number(expense.amount) } };
  }

  if (name === "delete_studio_expense") {
    const id = num(args.id);
    if (!id) return { error: "id مفقود" };
    const deleted = await db
      .delete(studioExpensesTable)
      .where(and(eq(studioExpensesTable.id, id), eq(studioExpensesTable.userId, userId)))
      .returning();
    if (deleted.length === 0) return { error: "مصروف الاستديو غير موجود" };
    return { success: true, deletedId: id };
  }

  // --- Search (precise lookup across the full transaction history) ---

  if (name === "search_transactions") {
    const [allTxs, clients, trips] = await Promise.all([
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, userId)),
      db.select().from(clientsTable).where(eq(clientsTable.userId, userId)),
      db.select().from(tripsTable).where(eq(tripsTable.userId, userId)),
    ]);
    const clientMap = new Map((clients as ClientRow[]).map((c) => [c.id, c.name]));
    const tripMap = new Map((trips as TripRow[]).map((t) => [t.id, t.name]));

    const norm = (s: string) => s.trim().toLowerCase();
    const clientNameQuery = typeof args.clientName === "string" && args.clientName.trim() ? norm(args.clientName) : null;
    const tripNameQuery = typeof args.tripName === "string" && args.tripName.trim() ? norm(args.tripName) : null;
    const descQuery = typeof args.descriptionContains === "string" && args.descriptionContains.trim() ? norm(args.descriptionContains) : null;
    const dateFrom = typeof args.dateFrom === "string" ? args.dateFrom : null;
    const dateTo = typeof args.dateTo === "string" ? args.dateTo : null;
    const minAmount = num(args.minAmount);
    const maxAmount = num(args.maxAmount);
    const typeFilter = typeof args.type === "string" ? args.type : null;
    const statusFilter = typeof args.status === "string" ? args.status : null;

    let matches = (allTxs as TxRow[]).filter((t) => {
      if (clientNameQuery) {
        const cName = t.clientId ? clientMap.get(t.clientId) : null;
        if (!cName || !norm(cName).includes(clientNameQuery)) return false;
      }
      if (tripNameQuery) {
        const tName = t.tripId ? tripMap.get(t.tripId) : null;
        if (!tName || !norm(tName).includes(tripNameQuery)) return false;
      }
      if (descQuery && !(t.description && norm(t.description).includes(descQuery))) return false;
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo && t.date > dateTo) return false;
      if (minAmount !== undefined && Number(t.amount) < minAmount) return false;
      if (maxAmount !== undefined && Number(t.amount) > maxAmount) return false;
      if (typeFilter && t.type !== typeFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      return true;
    });

    matches = matches.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

    const results = matches.map((t) => ({
      id: t.id,
      date: t.date,
      type: t.type,
      amount: Number(t.amount),
      currency: t.currency,
      clientName: t.clientId ? (clientMap.get(t.clientId) ?? null) : null,
      tripName: t.tripId ? (tripMap.get(t.tripId) ?? null) : null,
      description: t.description,
      status: t.status,
    }));

    return { success: true, count: results.length, transactions: results };
  }

  return { error: `أداة غير معروفة: ${name}` };
}

// GET /ai/history — full persistent conversation for the current user (oldest first).
router.get("/ai/history", requireAuth, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(aiMessagesTable)
      .where(eq(aiMessagesTable.userId, req.userId))
      .orderBy(asc(aiMessagesTable.createdAt));
    res.json({ messages: rows });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to load AI history");
    res.status(500).json({ error: "فشل تحميل سجل المحادثة" });
  }
});

// DELETE /ai/history — start a fresh conversation (wipes stored messages for this user only).
router.delete("/ai/history", requireAuth, async (req, res): Promise<void> => {
  try {
    await db.delete(aiMessagesTable).where(eq(aiMessagesTable.userId, req.userId));
    res.json({ success: true });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to clear AI history");
    res.status(500).json({ error: "فشل حذف سجل المحادثة" });
  }
});

// Phrases that sound like a completed write action. If the model uses these without an
// actual successful tool call behind them, we must not let the fabricated claim reach the user.
const CONFIRMATION_PATTERN = /\b(تم|تمت|أضفت|حذفت|عدّلت|عدلت|سجّلت|سجلت|أنجزت|done|added|deleted|updated)\b/i;
const ACTION_INTENT_PATTERN = /(أضف|ضيف|سجّل|سجل|احذف|امسح|عدّل|عدل|غيّر|غير|add\b|delete\b|remove\b|update\b|edit\b)/i;

router.post("/ai/query", requireAuth, async (req, res): Promise<void> => {
  const parsed = AiQueryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { question } = parsed.data;

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

    const todayISO = new Date().toISOString().split("T")[0];

    const systemInstruction = `أنت "بيلي" 🤖 — المساعد المالي الذكي الشخصي داخل هذا التطبيق، لتاجر يعمل بين الإمارات والولايات المتحدة وسوريا. أسلوبك ودود ومباشر وواثق، وتحكي عربي طبيعي مفهوم (فصحى ميسّرة مع لمسة لهجة شامية عند الحاجة). إذا سألك أحد عن اسمك، قل إنك "بيلي".
مهمتك: الإجابة على الأسئلة المالية بدقة بناءً على البيانات الحالية المقدمة أدناه، وأيضاً تنفيذ عمليات فعلية (إضافة/تعديل/حذف) على المعاملات والزبائن والرحلات والاستديوهات عند الطلب — عندك صلاحية كاملة على بيانات هذا الحساب عبر الأدوات المتوفرة لك.
تاريخ اليوم: ${todayISO}

- أجب دائماً بالعربية بشكل موجز وواضح
- نسّق ردودك لتكون سهلة القراءة بصرياً: حط **نجمتين حول أي رقم أو مبلغ أو اسم زبون/رحلة مهم** (مثل **٥٠٠ درهم** أو **أحمد**)، وإذا كان ردك يحتوي أكثر من بند (أكثر من زبون، معاملة، أو سطر بتقرير)، اعرضها كقائمة نقطية كل سطر يبدأ بـ "- " بدل فقرة واحدة طويلة متلاصقة. خلي كل فقرة قصيرة (سطرين-ثلاثة كحد أقصى) وافصل بين الأفكار المختلفة بسطر فاضي.
- استخدم الأرقام الفعلية من البيانات دون تقريب كبير
- إذا كان السؤال عن معلومة غير موجودة، قل ذلك بوضوح
- يمكنك الإجابة على أسئلة مثل: الأرصدة، ذمم الزبائن، أرباح الرحلات، مصاريف الاستديوهات، المعاملات المعلقة، مقارنات، وأي تحليل مالي
- كل بند في البيانات أدناه (معاملة، زبون، رحلة، استديو، مصروف استديو) يبدأ برقم مثل #123 — هذا هو الـ id الحقيقي المطلوب بالضبط عند استدعاء أي أداة تعديل أو حذف. لا تخترع أرقام id أبداً.

--- صلاحيات المعاملات (مهم جداً) ---
- لديك أدوات فعلية لإضافة/تعديل/حذف المعاملات (create_transaction / update_transaction / delete_transaction). استخدمها فقط عندما يطلب المستخدم صراحةً ذلك (مثل: "سجّلي قبضت ٥٠٠ من أحمد اليوم"، "احذف آخر معاملة لسامر"، "عدّل معاملة ٣٠٠ الفاتورة صيرها ٤٠٠").
- إذا لم يُذكر تاريخ عند الإضافة، استخدم تاريخ اليوم (${todayISO}).
- بعد تنفيذ أي عملية، أكّد للمستخدم بوضوح ماذا تم (النوع، المبلغ، العملة، التاريخ)، وإذا فشلت العملية اشرح السبب بإيجاز.
- لا تنفّذ أكثر من عملية واحدة لكل رسالة ما لم يطلب المستخدم صراحةً عدة عمليات في نفس الرسالة، أو ما لم تكن العملية الثانية جزءاً طبيعياً من إكمال نفس الطلب (مثل إضافة زبون/رحلة جديدة تلقائياً ثم تسجيل المعاملة المرتبطة به بنفس الرد — راجع قسم "إضافة زبون أو رحلة غير موجودة" أدناه).
- ⚠️ ممنوع منعاً باتاً أن تقول "تم إضافة/تعديل/حذف..." أو أي صيغة توحي بأن عملية حصلت فعلياً — على معاملة أو زبون أو رحلة أو استديو — إلا إذا استدعيت الأداة (function call) فعلياً وحصلت على نتيجة success من نتيجتها. لا تفترض النجاح أبداً ولا تتظاهر بالتنفيذ اعتماداً على الحوار فقط.

--- إضافة زبون أو رحلة غير موجودة (مهم جداً) ---
- قبل إنشاء معاملة مرتبطة بزبون أو رحلة، طابق الاسم المذكور مع قائمة الزبائن/الرحلات ببيانات اليوم أدناه بمرونة (تجاهل اختلاف اللغة/الإملاء، مثلاً "رشا" = "Rasha").
- إذا وجدت تطابقاً واضحاً ووحيداً: استخدم الـ id الموجود مباشرة، دون سؤال.
- إذا وجدت أكثر من زبون أو رحلة بنفس الاسم أو بأسماء متشابهة جداً: لا تختر واحداً عشوائياً ولا تفترض. اعرض له كل الخيارات المتطابقة بوضوح (رقم الهاتف إن وجد، والرصيد الحالي كما هو بالبيانات أدناه لكل واحد) واسأله أي واحد يقصد، مثلاً: "في عندي أكتر من زبون اسمه أحمد: (1) أحمد [0501234567] رصيده 200 AED له، (2) أحمد [0559876543] رصيده 500 USD عليه. مين تقصد؟" وانتظر رده قبل ما تكمل.
- إذا في اسم قريب جداً من اسم موجود بس مش مطابق تماماً (فرق حرف أو اثنين، أو شكله خطأ إملائي محتمل): اسأل تأكيد سريع، مثلاً "قصدك «أحمد» الموجود عندي، ولا هاد زبون جديد؟" وانتظر رده قبل ما تكمل.
- إذا لم تجد أي تطابق أو تشابه إطلاقاً (اسم جديد كلياً): **أضِفه تلقائياً بدون ما تسأل إذن** — استدعِ create_client أو create_trip مباشرة بنفس الرد، ثم استخدم الـ id الجديد فوراً لاستدعاء create_transaction بنفس الرد لإكمال العملية الأصلية بضربة وحدة. نفس سلوك ميزة الإدخال الصوتي بصفحة "معاملة جديدة" بالتطبيق: زبون/رحلة جديدة بالكامل تُضاف تلقائياً بدون تأكيد، والتأكيد يُطلب فقط لما يكون في التباس (اسم متشابه أو أكثر من نتيجة).
- بعد ما تضيف الزبون/الرحلة تلقائياً وتسجّل المعاملة، أخبر المستخدم بوضوح بالنتيجتين معاً بنفس الرد (مثلاً: "ضفت أحمد كزبون جديد وسجّلت المعاملة...")، عشان يعرف شو صار بالضبط.
- نفس منطق التمييز عند تعدد الأسماء أو تشابهها ينطبق أيضاً على أي طلب آخر يذكر اسم زبون أو رحلة (استفسار عن رصيد، تعديل، حذف، إلخ) — لا تفترض أبداً أيهم يقصد المستخدم إذا كان الاسم غير حاسم.

--- تعديل، حذف، أو استفسار عن معاملة بالوصف الطبيعي (مهم جداً) ---
- إذا وصف المستخدم معاملة بالكلام بدل رقمها (مثلاً بالتاريخ، الزبون، المبلغ، أو السبب — "بدي عدل الدفعة يلي دفعتها لأحمد أول أمس"، "احذف يلي دفعته لسامر الأسبوع الماضي"، "ليش دفعت ٣٠٠ لسامر بشهر ٧؟")، لا تخمّن ولا تعتمد فقط على السجل النصي المختصر أدناه. استخدم أداة search_transactions بكل ما توفر لديك من معطيات (اسم الزبون/الرحلة، نطاق تاريخ، مبلغ تقريبي، كلمة من الوصف) لإيجاد المعاملة أو المعاملات المطابقة أولاً، ثم تصرّف بناءً على نتيجتها.
- سجل المعاملات المعروض أدناه هو آخر 150 معاملة فقط من إجمالي الحساب؛ إذا شككت أن المعاملة أقدم من ذلك أو لم تجدها بالسياق، استخدم search_transactions قبل أن تفترض عدم وجودها.
- إذا رجعت نتيجة واحدة فقط مطابقة: نفّذ طلب التعديل/الحذف مباشرة (باستخدام id الذي رجع)، أو اشرح تفاصيلها إذا كان السؤال استفساراً فقط (ما المبلغ، لمين، ليش، إلخ — بالاعتماد على الوصف والبيانات الفعلية فقط، لا تخترع سبباً غير مذكور).
- إذا رجع أكثر من نتيجة ولم يكن واضحاً أيها يقصد المستخدم: اعرض له الخيارات باختصار (التاريخ، المبلغ، الوصف) واطلب منه يحدد.
- إذا لم ترجع أي نتيجة: أخبره بصراحة أنك ما لقيت معاملة مطابقة، بدل الادّعاء أو التخمين.

--- إدارة الزبائن، الرحلات، والاستديوهات (صلاحيات كاملة) ---
- عندك أدوات كاملة لإدارة الزبائن (create_client / update_client / delete_client)، الرحلات (create_trip / update_trip / delete_trip)، الاستديوهات (create_studio / update_studio / delete_studio)، ومصاريف الاستديوهات (create_studio_expense / delete_studio_expense). استخدمها عندما يطلب المستخدم ذلك صراحةً، أو ضمن سياق إضافة معاملة كما هو موضح أعلاه.
- ⚠️ حذف زبون أو رحلة أو استديو أو معاملة إجراء لا رجعة فيه. لا تستخدم أي أداة حذف (delete_*) إلا بعد تأكيد صريح وواضح من المستخدم على الحذف تحديداً — مجرد ذكر الاسم أو المعاملة بالحديث لا يُعتبر موافقة على حذفها. إذا لم تكن متأكداً 100% من هوية العنصر (id)، اسأل أو استخدم search_transactions/راجع البيانات أولاً بدل التخمين.
- حذف استديو يحذف معه تلقائياً كل مصاريفه المسجّلة — نبّه المستخدم لهذا صراحةً قبل التنفيذ إذا كان للاستديو مصاريف مسجّلة.

--- أدوات إضافية ---
- get_overdue_clients: استخدمها إذا سأل المستخدم عن الزبائن المتأخرين، أو إذا لاحظت من البيانات وجود ذمم معلّقة قديمة وتريد تنبيهه استباقياً في بداية المحادثة.
- prepare_whatsapp_reminder: لا تستدعِها إلا بعد موافقة صريحة من المستخدم على إرسال تذكير لزبون بعينه. النتيجة تحتوي رابط واتساب (whatsappLink) — اعرضه للمستخدم كرابط واضح ليضغط عليه، ولا تدّعِ أن الرسالة أُرسلت فعلياً؛ فقط الرابط جاهز، والمستخدم هو من يضغط إرسال.
- generate_report: استخدمها لأي طلب تقرير/ملخص مالي عن فترة محددة (بدل حساب الأرقام يدوياً من السياق النصي) لضمان دقة الأرقام. إذا لم يحدد المستخدم فترة، افترض الشهر الحالي.

البيانات المالية الحالية:
${context}`;

    const tools = [
      {
        functionDeclarations: [
          createTransactionDeclaration,
          updateTransactionDeclaration,
          deleteTransactionDeclaration,
          searchTransactionsDeclaration,
          createClientDeclaration,
          updateClientDeclaration,
          deleteClientDeclaration,
          createTripDeclaration,
          updateTripDeclaration,
          deleteTripDeclaration,
          createStudioDeclaration,
          updateStudioDeclaration,
          deleteStudioDeclaration,
          createStudioExpenseDeclaration,
          deleteStudioExpenseDeclaration,
          getOverdueClientsDeclaration,
          prepareWhatsappReminderDeclaration,
          generateReportDeclaration,
        ],
      },
    ];

    const genAI = getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction,
      tools,
    });

    // Load the real, persistent conversation from the DB (source of truth — not whatever the
    // client happens to hold in memory), so history survives across sessions/devices/reloads.
    // The stored history itself is capped at MAX_STORED_MESSAGES (see trimming below), so this
    // just loads all of it — never more than that cap.
    const recentMessages = await db
      .select()
      .from(aiMessagesTable)
      .where(eq(aiMessagesTable.userId, req.userId))
      .orderBy(desc(aiMessagesTable.createdAt))
      .limit(MAX_STORED_MESSAGES);
    const storedMessages = recentMessages.reverse();

    const chatHistory: Content[] = storedMessages
      .filter((m, i) => (i === 0 ? m.role === "user" : true))
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }));

    const chat = model.startChat({ history: chatHistory });
    let result = await withRetry(() => chat.sendMessage(question));

    const executedActions: ExecutedAction[] = [];
    // Allow a short chain of tool calls (e.g. create_client then create_transaction, or
    // search_transactions then update_transaction), capped to avoid runaway loops.
    for (let round = 0; round < 6; round++) {
      const calls = result.response.functionCalls();
      if (!calls || calls.length === 0) break;

      const responseParts: { functionResponse: { name: string; response: Record<string, unknown> } }[] = [];
      for (const call of calls) {
        const toolResult = await executeTool(req.userId, call.name, (call.args ?? {}) as Record<string, unknown>);
        executedActions.push({ name: call.name, success: !!toolResult.success, result: toolResult });
        responseParts.push({
          functionResponse: { name: call.name, response: toolResult },
        });
      }
      result = await withRetry(() => chat.sendMessage(responseParts));
    }

    let answer = result.response.text();
    const actionsPerformed = executedActions.some((a) => a.success);

    // Safety net: never let a fabricated "تم!" reach the user when nothing was actually
    // executed — this is what stops the assistant from claiming success without a real write.
    if (!actionsPerformed && CONFIRMATION_PATTERN.test(answer) && ACTION_INTENT_PATTERN.test(question)) {
      answer =
        "ما قدرت أتأكد إنه العملية نُفّذت فعلياً، فما بدي أأكد شي ما صار. ممكن تحدد أكتر (المبلغ، التاريخ، أو الزبون) وجرب تاني؟";
    }

    // Persist both sides of the exchange so the conversation survives reloads/devices.
    await db.insert(aiMessagesTable).values([
      { userId: req.userId, role: "user", content: question, actions: null },
      { userId: req.userId, role: "model", content: answer, actions: executedActions.length ? executedActions : null },
    ]);

    // Cap the stored conversation at MAX_STORED_MESSAGES — once it grows past that, drop the
    // oldest messages (FIFO) so history never grows unbounded for long-running users.
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(aiMessagesTable)
      .where(eq(aiMessagesTable.userId, req.userId));
    if (total > MAX_STORED_MESSAGES) {
      const oldest = await db
        .select({ id: aiMessagesTable.id })
        .from(aiMessagesTable)
        .where(eq(aiMessagesTable.userId, req.userId))
        .orderBy(asc(aiMessagesTable.createdAt))
        .limit(total - MAX_STORED_MESSAGES);
      if (oldest.length > 0) {
        await db.delete(aiMessagesTable).where(
          and(eq(aiMessagesTable.userId, req.userId), inArray(aiMessagesTable.id, oldest.map((r) => r.id))),
        );
      }
    }

    res.json({
      answer,
      data: {
        totalTransactions: txs.length,
        clientCount: clients.length,
        actionsPerformed,
        actions: executedActions,
      },
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
    req.log.error({ err }, "Failed to process AI query");
    res.status(500).json({ error: "فشل معالجة الاستعلام" });
  }
});

export default router;