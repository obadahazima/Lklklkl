export const MAX_AUDIO_BASE64_LENGTH = 18_000_000;
export const AUDIO_JSON_LIMIT = "20mb";
const AUDIO_TYPES = new Set(["audio/mp4", "audio/m4a", "audio/x-m4a", "audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/aac", "audio/3gpp", "audio/x-caf"]);

export function validateVoiceAudio(audioBase64: string, mimeType: string): string | null {
  if (!AUDIO_TYPES.has(mimeType)) return "صيغة التسجيل غير مدعومة";
  if (!audioBase64 || audioBase64.length > MAX_AUDIO_BASE64_LENGTH) return "التسجيل طويل جداً، سجّل مقطعاً أقصر";
  if (audioBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) return "بيانات التسجيل غير صالحة";
  return null;
}

export function validISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const normalizeDigits = (s: string) => s
  .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** Calendar arithmetic is UTC; referenceDate is the caller's local calendar day. */
export function extractDateFallback(text: string, referenceDate: string): string | null {
  if (!validISODate(referenceDate)) return null;
  const t = normalizeDigits(text.trim());
  const today = new Date(`${referenceDate}T12:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (n: number) => iso(new Date(today.getTime() + n * 86_400_000));
  const calendar = (year: number, month: number, day: number) => {
    const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return validISODate(value) ? value : null;
  };
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return calendar(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    let year = m[3] ? Number(m[3]) : today.getUTCFullYear();
    if (year < 100) year += 2000;
    return calendar(year, Number(m[2]), Number(m[1]));
  }
  m = t.match(/قبل\s+(\d+)\s*(?:يوم|أيام|ايام)/);
  if (m) return shift(-Number(m[1]));
  m = t.match(/بعد\s+(\d+)\s*(?:يوم|أيام|ايام)/);
  if (m) return shift(Number(m[1]));
  const days: Record<string, number> = { "يومين": 2, "يومان": 2, "ثلاثة أيام": 3, "تلاتة أيام": 3, "أربعة أيام": 4, "اربعة أيام": 4, "خمسة أيام": 5 };
  for (const [phrase, n] of Object.entries(days)) {
    if (t.includes(`قبل ${phrase}`)) return shift(-n);
    if (t.includes(`بعد ${phrase}`)) return shift(n);
  }
  m = t.match(/\b(\d+)\s+days?\s+ago\b/i);
  if (m) return shift(-Number(m[1]));
  m = t.match(/\bin\s+(\d+)\s+days?\b/i);
  if (m) return shift(Number(m[1]));
  if (/أول\s*(?:أمس|امبارح|إمبارح|مبارح)|day before yesterday/i.test(t)) return shift(-2);
  if (/(?:^|[^\p{L}])(?:أمس|امبارح|إمبارح|مبارح)(?:$|[^\p{L}])|\byesterday\b/iu.test(t)) return shift(-1);
  if (/(?:^|[^\p{L}])(?:بكرا|بكرة|غدا|غداً)(?:$|[^\p{L}])|\btomorrow\b/iu.test(t)) return shift(1);

  const weekdays: Record<string, number> = { "الأحد": 0, "الاحد": 0, "الإثنين": 1, "الاثنين": 1, "الثلاثاء": 2, "الثلاثا": 2, "الأربعاء": 3, "الاربعاء": 3, "الخميس": 4, "الجمعة": 5, "الجمعه": 5, "السبت": 6, sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  for (const [name, dow] of Object.entries(weekdays)) {
    const matches = new RegExp(`(?:^|[^\\p{L}])${name}(?:$|[^\\p{L}])`, "iu").test(t);
    if (!matches) continue;
    const diff = (today.getUTCDay() - dow + 7) % 7;
    if (/القادم|القادمه|القادمة|الجاي|\bnext\b/i.test(t)) return shift(diff === 0 ? 7 : 7 - diff);
    if (/الماضي|السابق|اللي فات|\blast\b/i.test(t)) return shift(-(diff || 7));
    return shift(-diff);
  }
  if (/الأسبوع\s+(?:الماضي|اللي فات|السابق)|last week/i.test(t)) return shift(-7);
  if (/(?:^|[^\p{L}])اليوم(?:$|[^\p{L}])|\btoday\b/iu.test(t)) return referenceDate;
  m = t.match(/(?:بتاريخ|يوم)\s+(\d{1,2})(?!\d|\s*[\/\-]\s*\d)/) ?? t.match(/(\d{1,2})\s+الشهر/);
  if (m) return calendar(today.getUTCFullYear(), today.getUTCMonth() + 1, Number(m[1]));
  const months: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
  m = t.toLowerCase().match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  return m ? calendar(today.getUTCFullYear(), months[m[1]], Number(m[2])) : null;
}

const normalizeName = (s: string) => s.toLowerCase().normalize("NFKC")
  .replace(/[\u064b-\u065f\u0670\u0640]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();

/** A valid id alone does not prove the model chose the right Ahmad. Keep ambiguous names unresolved. */
export function resolveVoiceEntity(id: unknown, mention: unknown, rows: { id: number; name: string }[]) {
  const name = typeof mention === "string" ? mention.trim() : "";
  const n = normalizeName(name);
  const exact = rows.filter((r) => normalizeName(r.name) === n);
  const possible = rows.filter((r) => n && (` ${normalizeName(r.name)} `).includes(` ${n} `));
  if (exact.length > 1 || (exact.length === 0 && possible.length > 1)) return { id: null, name: name || null };
  if (exact.length === 1) return { id: exact[0].id, name: exact[0].name };
  const numericId = typeof id === "number" ? id : typeof id === "string" ? Number(id) : NaN;
  const match = rows.find((r) => Number.isInteger(numericId) && r.id === numericId);
  return { id: match?.id ?? null, name: match?.name ?? (name || null) };
}

export function voiceDraftError(raw: Record<string, unknown>, activeCurrencies: string[], currency: string | null): string | null {
  if (raw.requiresClarification === true) return typeof raw.clarificationQuestion === "string" && raw.clarificationQuestion.trim()
    ? raw.clarificationQuestion.trim() : "اذكر معاملة واحدة وحدّد المبلغ والعملة بوضوح";
  if (!["income", "expense", "payment", "receipt", "transfer"].includes(String(raw.type))) return "لم يتضح نوع المعاملة، وضّح هل دفعت أم قبضت أم حوّلت بين حساباتك";
  if (typeof raw.amount !== "number" || !Number.isFinite(raw.amount) || raw.amount <= 0 || raw.amount >= 1e13) return "اذكر مبلغاً صحيحاً أكبر من الصفر";
  if (!currency || !activeCurrencies.includes(currency)) return `العملة ${currency ?? "المذكورة"} غير مفعّلة. فعّلها من الإعدادات ثم أعد المحاولة؛ لن نستبدلها بعملة أخرى`;
  if (Math.abs(raw.amount * 100 - Math.round(raw.amount * 100)) > 0.01) return "المبلغ يحتوي أكثر من منزلتين عشريتين، حدّد المبلغ المطلوب حفظه";
  return null;
}
