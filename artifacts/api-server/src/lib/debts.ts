import { db, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { allocateFIFO, canonicalType } from "./debt-math.js";
export async function ensureDebts() {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billy.debts.v1'))`);
    await tx.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS debt_kind text, ADD COLUMN IF NOT EXISTS due_date text, ADD COLUMN IF NOT EXISTS allocations jsonb`);
  });
}
export async function collectionAllocations(tx: Pick<typeof db,"select">, userId: string, type: string, clientId: number | null | undefined, currency: string, amount: number) {
  if (canonicalType(type) !== "income" || !clientId) return [];
  const rows = await tx.select().from(transactionsTable).where(eq(transactionsTable.userId,userId));
  return allocateFIFO(rows,clientId,currency,amount);
}
