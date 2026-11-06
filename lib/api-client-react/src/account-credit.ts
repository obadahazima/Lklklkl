import { normalizeAmountInput } from "./voice-utils";

/** Accept a user-supplied minus once; credit debt always has a negative ledger sign. */
export function openingAccountBalance(type: string, input: string): number {
  const raw = input.trim().replace(/^−/, "-");
  const magnitude = normalizeAmountInput((raw.startsWith("-") || raw.startsWith("+")) ? raw.slice(1).trim() : raw || "0");
  const value = type === "credit" || raw.startsWith("-") ? -magnitude : magnitude;
  return Number.isFinite(value) && Math.abs(value) < 1e13 ? (value === 0 ? 0 : value) : NaN;
}

export function optionalCreditLimit(input: string): number | null {
  if (!input.trim()) return null;
  const value = normalizeAmountInput(input);
  return Number.isFinite(value) && value >= 0 && value < 1e13 ? value : NaN;
}

export function creditAvailability(balance: number, limit: number): number {
  return Math.max(0, Math.round((limit + balance) * 100) / 100);
}
