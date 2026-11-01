import { createHash } from "node:crypto";
import { validISODate } from "../lib/voice-input.js";
import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, clientsTable, tripsTable, accountsTable, transactionReceiptsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  CreateTransactionBody,
  UpdateTransactionBody,
  GetTransactionParams,
  UpdateTransactionParams,
  DeleteTransactionParams,
  ListTransactionsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.use(requireAuth);

/**
 * Verifies clientId/tripId/accountId (when provided) actually belong to this user before
 * they're attached to a transaction. Without this, any authenticated user could pass another
 * user's numeric id and both (a) silently link their transaction to a stranger's record, and
 * (b) have enrichTransaction() leak that stranger's client/trip/account name back to them.
 */
async function assertOwnedForeignKeys(
  userId: string,
  ids: { clientId?: number | null; tripId?: number | null; accountId?: number | null; toAccountId?: number | null },
  executor: Pick<typeof db, "select"> = db,
): Promise<string | null> {
  if (ids.clientId != null) {
    const [c] = await executor.select({ id: clientsTable.id }).from(clientsTable).where(and(eq(clientsTable.id, ids.clientId), eq(clientsTable.userId, userId)));
    if (!c) return "Invalid clientId";
  }
  if (ids.tripId != null) {
    const [tr] = await executor.select({ id: tripsTable.id }).from(tripsTable).where(and(eq(tripsTable.id, ids.tripId), eq(tripsTable.userId, userId)));
    if (!tr) return "Invalid tripId";
  }
  if (ids.accountId != null) {
    const [a] = await executor.select({ id: accountsTable.id }).from(accountsTable).where(and(eq(accountsTable.id, ids.accountId), eq(accountsTable.userId, userId)));
    if (!a) return "Invalid accountId";
  }
  if (ids.toAccountId != null) {
    const [a] = await executor.select({ id: accountsTable.id }).from(accountsTable).where(and(eq(accountsTable.id, ids.toAccountId), eq(accountsTable.userId, userId)));
    if (!a) return "Invalid toAccountId";
  }
  return null;
}

/** type=transfer requires a toAccountId distinct from accountId; every other type must not set one. */
function validateTransferFields(type: string, accountId: number | null | undefined, toAccountId: number | null | undefined): string | null {
  if (type === "transfer") {
    if (toAccountId == null) return "toAccountId is required for transfer transactions";
    if (accountId != null && toAccountId === accountId) return "toAccountId must differ from accountId";
  } else if (toAccountId != null) {
    return "toAccountId is only allowed for transfer transactions";
  }
  return null;
}

async function enrichTransaction(t: typeof transactionsTable.$inferSelect, executor: Pick<typeof db, "select"> = db) {
  let clientName: string | null = null;
  let tripName: string | null = null;
  let accountName: string | null = null;
  let toAccountName: string | null = null;

  if (t.clientId) {
    const [c] = await executor.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, t.clientId));
    clientName = c?.name ?? null;
  }
  if (t.tripId) {
    const [tr] = await executor.select({ name: tripsTable.name }).from(tripsTable).where(eq(tripsTable.id, t.tripId));
    tripName = tr?.name ?? null;
  }
  if (t.accountId) {
    const [a] = await executor.select({ name: accountsTable.name }).from(accountsTable).where(eq(accountsTable.id, t.accountId));
    accountName = a?.name ?? null;
  }
  if (t.toAccountId) {
    const [a] = await executor.select({ name: accountsTable.name }).from(accountsTable).where(eq(accountsTable.id, t.toAccountId));
    toAccountName = a?.name ?? null;
  }

  return {
    ...t,
    amount: Number(t.amount),
    clientName,
    tripName,
    accountName,
    toAccountName,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/transactions", async (req, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse({
    clientId: req.query.clientId ? Number(req.query.clientId) : undefined,
    tripId: req.query.tripId ? Number(req.query.tripId) : undefined,
    accountId: req.query.accountId ? Number(req.query.accountId) : undefined,
    currency: req.query.currency,
    type: req.query.type,
    status: req.query.status,
  });

  try {
    const conditions = [eq(transactionsTable.userId, req.userId)];
    if (parsed.success) {
      if (parsed.data.clientId != null) conditions.push(eq(transactionsTable.clientId, parsed.data.clientId));
      if (parsed.data.tripId != null) conditions.push(eq(transactionsTable.tripId, parsed.data.tripId));
      if (parsed.data.accountId != null) conditions.push(eq(transactionsTable.accountId, parsed.data.accountId));
      if (parsed.data.currency != null) conditions.push(eq(transactionsTable.currency, parsed.data.currency));
      if (parsed.data.type != null) conditions.push(eq(transactionsTable.type, parsed.data.type));
      if (parsed.data.status != null) conditions.push(eq(transactionsTable.status, parsed.data.status));
    }

    const txs = await db
      .select()
      .from(transactionsTable)
      .where(and(...conditions))
      .orderBy(desc(transactionsTable.date));

    const enriched = await Promise.all(txs.map((transaction) => enrichTransaction(transaction)));
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to list transactions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/transactions", async (req, res): Promise<void> => {
  if (req.header("X-Offline-Owner") && req.header("X-Offline-Owner") !== req.userId) {
    res.status(403).json({ error: "offline_owner_mismatch" });
    return;
  }
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const input = parsed.data;
  if (!validISODate(input.date) || !["income", "expense", "payment", "receipt", "transfer"].includes(input.type)
    || !["pending", "settled"].includes(input.status) || !/^[A-Z]{3}$/.test(input.currency)
    || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount >= 1e13
    || Number(input.amount.toFixed(2)) !== input.amount
    || !Number.isInteger(input.accountId) || input.accountId <= 0) {
    res.status(400).json({ error: "Invalid transaction date, amount, currency, status or account" });
    return;
  }
  const transferError = validateTransferFields(input.type, input.accountId, input.toAccountId);
  if (transferError) { res.status(400).json({ error: transferError }); return; }
  const values = {
    userId: req.userId, type: input.type, amount: String(input.amount), currency: input.currency,
    date: input.date, status: input.status, description: input.description?.trim() || null,
    clientId: input.type === "transfer" ? null : input.clientId ?? null,
    tripId: input.type === "transfer" ? null : input.tripId ?? null,
    accountId: input.accountId, toAccountId: input.type === "transfer" ? input.toAccountId ?? null : null,
  };
  const hash = createHash("sha256").update(JSON.stringify(values)).digest("hex");
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billy.ledger.user'), hashtext(${req.userId}))`);
      if (input.clientRequestId) {
        // Serializes matching keys across API instances; receipt and transaction commit together.
        const [receipt] = await tx.select().from(transactionReceiptsTable).where(and(eq(transactionReceiptsTable.userId, req.userId), eq(transactionReceiptsTable.requestId, input.clientRequestId)));
        if (receipt) return receipt.payloadHash === hash
          ? { status: 200, body: receipt.response }
          : { status: 409, body: { error: "idempotency_key_conflict" } };
      }
      const fkError = await assertOwnedForeignKeys(req.userId, values, tx);
      if (fkError) return { status: 400, body: { error: fkError } };
      const [txRow] = await tx.insert(transactionsTable).values(values).returning();
      const response = await enrichTransaction(txRow, tx);
      if (input.clientRequestId) await tx.insert(transactionReceiptsTable).values({ userId: req.userId, requestId: input.clientRequestId, payloadHash: hash, response });
      return { status: 201, body: response };
    });
    res.status(result.status).json(result.body);
  } catch (err) {
    req.log.error({ err }, "Failed to create transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/transactions/:id", async (req, res): Promise<void> => {
  const parsed = GetTransactionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [tx] = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.id, parsed.data.id), eq(transactionsTable.userId, req.userId)));
    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(await enrichTransaction(tx));
  } catch (err) {
    req.log.error({ err }, "Failed to get transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/transactions/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateTransactionParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateTransactionBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  if ((bodyParsed.data.date !== undefined && !validISODate(bodyParsed.data.date))
    || (bodyParsed.data.type !== undefined && !["income", "expense", "payment", "receipt", "transfer"].includes(bodyParsed.data.type))
    || (bodyParsed.data.status !== undefined && !["pending", "settled"].includes(bodyParsed.data.status))
    || (bodyParsed.data.currency !== undefined && !/^[A-Z]{3}$/.test(bodyParsed.data.currency))
    || (bodyParsed.data.amount !== undefined && (!Number.isFinite(bodyParsed.data.amount) || bodyParsed.data.amount <= 0 || bodyParsed.data.amount >= 1e13 || Number(bodyParsed.data.amount.toFixed(2)) !== bodyParsed.data.amount))) {
    res.status(400).json({ error: "Invalid transaction fields" });
    return;
  }
  try {
    const fkError = await assertOwnedForeignKeys(req.userId, {
      clientId: bodyParsed.data.clientId,
      tripId: bodyParsed.data.tripId,
      accountId: bodyParsed.data.accountId,
      toAccountId: bodyParsed.data.toAccountId,
    });
    if (fkError) {
      res.status(400).json({ error: fkError });
      return;
    }

    const [existing] = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.id, paramsParsed.data.id), eq(transactionsTable.userId, req.userId)));
    if (!existing) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    const effectiveType = bodyParsed.data.type ?? existing.type;
    const effectiveAccountId = bodyParsed.data.accountId !== undefined ? bodyParsed.data.accountId : existing.accountId;
    // If the caller is switching type away from "transfer" and didn't explicitly send a new
    // toAccountId, the old destination account is implicitly cleared (see below) — validate
    // against that same implied value, not the stale existing one, or this would wrongly reject
    // a perfectly valid "change type from transfer to expense" request.
    const willClearToAccountId = effectiveType !== "transfer" && bodyParsed.data.toAccountId === undefined;
    const effectiveToAccountId = willClearToAccountId
      ? null
      : bodyParsed.data.toAccountId !== undefined ? bodyParsed.data.toAccountId : existing.toAccountId;
    const transferError = validateTransferFields(effectiveType, effectiveAccountId, effectiveToAccountId);
    if (transferError) {
      res.status(400).json({ error: transferError });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (bodyParsed.data.type !== undefined) updateData.type = bodyParsed.data.type;
    if (bodyParsed.data.amount !== undefined) updateData.amount = String(bodyParsed.data.amount);
    if (bodyParsed.data.currency !== undefined) updateData.currency = bodyParsed.data.currency;
    if (bodyParsed.data.date !== undefined) updateData.date = bodyParsed.data.date;
    if (bodyParsed.data.status !== undefined) updateData.status = bodyParsed.data.status;
    if (bodyParsed.data.description !== undefined) updateData.description = bodyParsed.data.description;
    if (bodyParsed.data.clientId !== undefined) updateData.clientId = bodyParsed.data.clientId;
    if (bodyParsed.data.tripId !== undefined) updateData.tripId = bodyParsed.data.tripId;
    if (bodyParsed.data.accountId !== undefined) updateData.accountId = bodyParsed.data.accountId;
    if (bodyParsed.data.toAccountId !== undefined) updateData.toAccountId = bodyParsed.data.toAccountId;
    // Clearing toAccountId when switching away from transfer, so a stale destination account
    // never lingers on a transaction that's no longer a transfer.
    if (willClearToAccountId) {
      updateData.toAccountId = null;
    }

    const [tx] = await db
      .update(transactionsTable)
      .set(updateData)
      .where(and(eq(transactionsTable.id, paramsParsed.data.id), eq(transactionsTable.userId, req.userId)))
      .returning();
    if (!tx) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(await enrichTransaction(tx));
  } catch (err) {
    req.log.error({ err }, "Failed to update transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/transactions/:id", async (req, res): Promise<void> => {
  const parsed = DeleteTransactionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db
      .delete(transactionsTable)
      .where(and(eq(transactionsTable.id, parsed.data.id), eq(transactionsTable.userId, req.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
