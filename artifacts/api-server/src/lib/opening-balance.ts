import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
export async function ensureOpeningBalanceDates() {
 await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billy.opening-balance.v1'))`);
  await tx.execute(sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS opening_balance_date text`);
  await tx.execute(sql`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS included_in_opening_balance boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS destination_included_in_opening_balance boolean NOT NULL DEFAULT false`);
 });
}
