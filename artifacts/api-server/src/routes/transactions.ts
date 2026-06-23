import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, clientsTable, tripsTable, studiosTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
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

async function enrichTransaction(t: typeof transactionsTable.$inferSelect) {
  let clientName: string | null = null;
  let tripName: string | null = null;
  let studioName: string | null = null;

  if (t.clientId) {
    const [c] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, t.clientId));
    clientName = c?.name ?? null;
  }
  if (t.tripId) {
    const [tr] = await db.select({ name: tripsTable.name }).from(tripsTable).where(eq(tripsTable.id, t.tripId));
    tripName = tr?.name ?? null;
  }
  if (t.studioId) {
    const [s] = await db.select({ name: studiosTable.name }).from(studiosTable).where(eq(studiosTable.id, t.studioId));
    studioName = s?.name ?? null;
  }

  return {
    ...t,
    amount: Number(t.amount),
    clientName,
    tripName,
    studioName,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/transactions", async (req, res): Promise<void> => {
  const parsed = ListTransactionsQueryParams.safeParse({
    clientId: req.query.clientId ? Number(req.query.clientId) : undefined,
    tripId: req.query.tripId ? Number(req.query.tripId) : undefined,
    currency: req.query.currency,
    type: req.query.type,
    status: req.query.status,
  });

  try {
    const conditions = [eq(transactionsTable.userId, req.userId)];
    if (parsed.success) {
      if (parsed.data.clientId != null) conditions.push(eq(transactionsTable.clientId, parsed.data.clientId));
      if (parsed.data.tripId != null) conditions.push(eq(transactionsTable.tripId, parsed.data.tripId));
      if (parsed.data.currency != null) conditions.push(eq(transactionsTable.currency, parsed.data.currency));
      if (parsed.data.type != null) conditions.push(eq(transactionsTable.type, parsed.data.type));
      if (parsed.data.status != null) conditions.push(eq(transactionsTable.status, parsed.data.status));
    }

    const txs = await db
      .select()
      .from(transactionsTable)
      .where(and(...conditions))
      .orderBy(desc(transactionsTable.date));

    const enriched = await Promise.all(txs.map(enrichTransaction));
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to list transactions");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.amount <= 0) {
    res.status(400).json({ error: "Amount must be greater than zero" });
    return;
  }
  try {
    const [tx] = await db
      .insert(transactionsTable)
      .values({
        userId: req.userId,
        type: parsed.data.type,
        amount: String(parsed.data.amount),
        currency: parsed.data.currency,
        date: parsed.data.date,
        status: parsed.data.status,
        description: parsed.data.description ?? null,
        clientId: parsed.data.clientId ?? null,
        tripId: parsed.data.tripId ?? null,
        studioId: parsed.data.studioId ?? null,
      })
      .returning();
    res.status(201).json(await enrichTransaction(tx));
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
  if (bodyParsed.data.amount !== undefined && bodyParsed.data.amount <= 0) {
    res.status(400).json({ error: "Amount must be greater than zero" });
    return;
  }
  try {
    const updateData: Record<string, unknown> = {};
    if (bodyParsed.data.type !== undefined) updateData.type = bodyParsed.data.type;
    if (bodyParsed.data.amount !== undefined) updateData.amount = String(bodyParsed.data.amount);
    if (bodyParsed.data.currency !== undefined) updateData.currency = bodyParsed.data.currency;
    if (bodyParsed.data.date !== undefined) updateData.date = bodyParsed.data.date;
    if (bodyParsed.data.status !== undefined) updateData.status = bodyParsed.data.status;
    if (bodyParsed.data.description !== undefined) updateData.description = bodyParsed.data.description;
    if (bodyParsed.data.clientId !== undefined) updateData.clientId = bodyParsed.data.clientId;
    if (bodyParsed.data.tripId !== undefined) updateData.tripId = bodyParsed.data.tripId;

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
