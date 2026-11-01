/** Keep below the transcription route's 20 MiB JSON limit, including base64 overhead. */
export const MAX_VOICE_BASE64_LENGTH = 18_000_000;

export function localISODate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function normalizeAmountInput(value: string): number {
  const normalized = value.trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/٬/g, "")
    .replace(/٫/g, ".");
  // Do not let parseFloat silently turn "1,500" into 1, or "50abc" into 50.
  const plain = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(normalized)
    ? normalized.replace(/,/g, "") : normalized;
  return /^\d+(\.\d{1,2})?$/.test(plain) ? Number(plain) : NaN;
}

export function voiceAccountSelection(
  parsed: { accountId?: number | null; accountName?: string | null; toAccountId?: number | null; type?: string | null },
  accounts: { id: number }[] = [],
): { accountId: string; toAccountId: string } {
  return {
    accountId: parsed.accountId != null ? String(parsed.accountId)
      : !parsed.accountName && parsed.type !== "transfer" && accounts.length === 1 ? String(accounts[0].id) : "",
    toAccountId: parsed.type === "transfer" && parsed.toAccountId != null ? String(parsed.toAccountId) : "",
  };
}

export async function voiceBlobPayload(blob: Blob): Promise<{ audioBase64: string; mimeType: string }> {
  if (blob.size === 0) throw new Error("record_failed");
  if (Math.ceil(blob.size / 3) * 4 > MAX_VOICE_BASE64_LENGTH) throw new Error("recording_too_long");
  const audioBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("record_failed"));
    reader.readAsDataURL(blob);
  });
  return { audioBase64, mimeType: blob.type.split(";")[0] || "audio/webm" };
}

export function normalizeEntityName(value: string): string {
  return value.toLowerCase().normalize("NFKC").replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/\s+/g, " ").trim();
}
