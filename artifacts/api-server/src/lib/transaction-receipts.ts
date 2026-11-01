import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/** Additive startup migration; concurrent API instances serialize on the same lock. */
export async function ensureTransactionReceipts() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billy.transaction-receipts.migration.v1'))`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS transaction_receipts (
      user_id text NOT NULL,
      request_id uuid NOT NULL,
      payload_hash text NOT NULL,
      response jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT transaction_receipts_user_id_request_id_pk PRIMARY KEY (user_id, request_id)
    )`);
  });
}
