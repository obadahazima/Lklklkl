import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getCurrencySymbol } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAmount(amount: number, currency: string): string {
  const sym = getCurrencySymbol(currency);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${formatted} ${sym}`;
}

export function currencyClass(currency: string): string {
  if (currency === "AED") return "currency-aed";
  if (currency === "USD") return "currency-usd";
  if (currency === "SYP") return "currency-syp";
  return "currency-other";
}

export function typeLabel(type: string, lang: Lang = "ar"): string {
  const labels: Record<string, Record<Lang, string>> = {
    income: { ar: "دخل", en: "Income" },
    expense: { ar: "مصروف", en: "Expense" },
    payment: { ar: "دفع", en: "Payment" },
    receipt: { ar: "قبض", en: "Receipt" },
  };
  return labels[type]?.[lang] ?? type;
}

export function typeClass(type: string): string {
  const classes: Record<string, string> = {
    income: "type-income",
    expense: "type-expense",
    payment: "type-payment",
    receipt: "type-receipt",
  };
  return classes[type] || "";
}

export function statusLabel(status: string, lang: Lang = "ar"): string {
  const labels: Record<string, Record<Lang, string>> = {
    pending: { ar: "معلقة", en: "Pending" },
    settled: { ar: "مسددة", en: "Settled" },
    active: { ar: "نشطة", en: "Active" },
    closed: { ar: "مغلقة", en: "Closed" },
  };
  return labels[status]?.[lang] ?? status;
}

export function statusClass(status: string): string {
  const classes: Record<string, string> = {
    pending: "status-pending",
    settled: "status-settled",
    active: "status-active",
    closed: "status-closed",
  };
  return classes[status] || "";
}

export function formatDate(date: string, lang: Lang = "ar"): string {
  try {
    return new Date(date).toLocaleDateString(lang === "ar" ? "ar-AE" : "en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return date;
  }
}
