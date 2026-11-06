import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function ensureAccountCreditLimits() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billy.account-credit-limit.v1'))`);
    await tx.execute(sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit numeric(15,2)`);
  });
}

export function validAccountAmount(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) < 1e13 && Math.abs(value * 100 - Math.round(value * 100)) < 0.001;
}

export function creditOpeningBalance(type: string, value: number): number {
  return type === "credit" ? -Math.abs(value) : value;
}
