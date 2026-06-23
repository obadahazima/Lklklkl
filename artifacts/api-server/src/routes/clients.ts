import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateClientBody,
  UpdateClientBody,
  GetClientParams,
  UpdateClientParams,
  DeleteClientParams,
  GetClientStatementParams,
} from "@workspace/api-zod";
import { getExchangeRates, toAed } from "../utils/exchange-rates.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/clients", async (req, res): Promise<void> => {
  try {
    const clients = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.userId, req.userId))
      .orderBy(clientsTable.name);
    res.json(clients.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to list clients");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = CreateClientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [client] = await db
      .insert(clientsTable)
      .values({ ...parsed.data, userId: req.userId })
      .returning();
    res.status(201).json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clients/:id", async (req, res): Promise<void> => {
  const parsed = GetClientParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [client] = await db
      .select()
      .from(clientsTable)
      .where(and(eq(clientsTable.id, parsed.data.id), eq(clientsTable.userId, req.userId)));
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to get client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/clients/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateClientParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateClientBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  try {
    const [client] = await db
      .update(clientsTable)
      .set(bodyParsed.data)
      .where(and(eq(clientsTable.id, paramsParsed.data.id), eq(clientsTable.userId, req.userId)))
      .returning();
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }
    res.json({ ...client, createdAt: client.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to update client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/clients/:id", async (req, res): Promise<void> => {
  const parsed = DeleteClientParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db
      .delete(clientsTable)
      .where(and(eq(clientsTable.id, parsed.data.id), eq(clientsTable.userId, req.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete client");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/clients/:id/statement", async (req, res): Promise<void> => {
  const parsed = GetClientStatementParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [[client], rates] = await Promise.all([
      db
        .select()
        .from(clientsTable)
        .where(and(eq(clientsTable.id, parsed.data.id), eq(clientsTable.userId, req.userId))),
      getExchangeRates(),
    ]);
    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const txs = await db
      .select()
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.clientId, parsed.data.id),
          eq(transactionsTable.userId, req.userId),
        ),
      )
      .orderBy(transactionsTable.date);

    const currencies = [...new Set(txs.map((t) => t.currency))];
    const balances = currencies
      .map((currency) => {
        const currTxs = txs.filter((t) => t.currency === currency);
        const paid = currTxs
          .filter((t) => t.type === "expense" || t.type === "payment")
          .reduce((s, t) => s + Number(t.amount), 0);
        const received = currTxs
          .filter((t) => t.type === "income" || t.type === "receipt")
          .reduce((s, t) => s + Number(t.amount), 0);
        return { currency, paid, received, openBalance: received - paid };
      })
      .filter((b) => b.paid !== 0 || b.received !== 0);

    const totalBalanceAED = Math.round(
      balances.reduce((sum, b) => sum + toAed(b.openBalance, b.currency, rates), 0) * 100,
    ) / 100;

    const enrichedTxs = txs.map((t) => ({
      ...t,
      amount: Number(t.amount),
      clientName: client.name,
      tripName: null as string | null,
      studioName: null as string | null,
      createdAt: t.createdAt.toISOString(),
    }));

    res.json({
      client: { ...client, createdAt: client.createdAt.toISOString() },
      transactions: enrichedTxs,
      balances,
      totalBalanceAED,
      exchangeRates: rates,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get client statement");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
