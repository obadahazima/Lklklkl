export const TRANSACTION_TYPES = ["income", "expense", "payment", "receipt", "transfer", "receivable"] as const;
export type ManualDraft = {
  includedInOpeningBalance?: string; destinationIncludedInOpeningBalance?: string;
  debtKind?: string; dueDate?: string;
  type: string; amount: string; currency: string; accountId: string; toAccountId: string;
  clientId: string; tripId: string; description: string; status: string; date: string;
};

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function transactionError(value: {
  debtKind?: unknown; dueDate?: unknown;
  date?: unknown; type?: unknown; amount?: unknown; currency?: unknown; status?: unknown;
  accountId?: unknown; toAccountId?: unknown; clientId?: unknown; tripId?: unknown;
}): string | null {
  if (!isCalendarDate(value.date)) return "invalid_date";
  if (!(TRANSACTION_TYPES as readonly unknown[]).includes(value.type)) return "invalid_type";
  if (typeof value.amount !== "number" || !Number.isFinite(value.amount) || value.amount <= 0 || value.amount >= 1e13 || Number(value.amount.toFixed(2)) !== value.amount) return "invalid_amount";
  if (typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)) return "invalid_currency";
  if (value.status !== "pending" && value.status !== "settled") return "invalid_status";
  if (value.type === "receivable" && (!Number.isInteger(value.clientId) || Number(value.clientId) <= 0 || !["sale","opening","loan","loan_now"].includes(String(value.debtKind)) || (value.dueDate && (!isCalendarDate(value.dueDate) || value.dueDate < String(value.date))))) return "invalid_receivable";
  if ((value.type !== "receivable" || value.debtKind === "loan_now") && (!Number.isInteger(value.accountId) || Number(value.accountId) <= 0)) return "account_required";
  if (value.type === "transfer" && (!Number.isInteger(value.toAccountId) || Number(value.toAccountId) <= 0 || value.toAccountId === value.accountId)) return "invalid_destination";
  for (const id of [value.clientId, value.tripId]) if (id != null && (!Number.isInteger(id) || Number(id) <= 0)) return "invalid_reference";
  return null;
}

export function manualErrorMessage(code: string, ar: boolean): string {
  const messages: Record<string, [string, string]> = {
    invalid_receivable: ["اختر الشخص وأصل الذمة وتاريخ استحقاق صالح", "Choose the person, receivable origin and a valid due date"],
    invalid_date: ["أدخل تاريخاً حقيقياً بصيغة YYYY-MM-DD", "Enter a real date in YYYY-MM-DD format"],
    invalid_amount: ["أدخل مبلغاً موجباً بحد أقصى منزلتين عشريتين", "Enter a positive amount with at most two decimal places"],
    account_required: ["اختر الحساب الذي دخلت أو خرجت منه المصاري", "Choose the account used for this transaction"],
    invalid_destination: ["اختر حساب وجهة مختلفاً عن الحساب المصدر", "Choose a different destination account"],
    invalid_currency: ["اختر عملة صالحة ومفعّلة", "Choose a valid enabled currency"],
  };
  return (messages[code] ?? ["راجع بيانات المعاملة", "Review the transaction details"])[ar ? 0 : 1];
}
