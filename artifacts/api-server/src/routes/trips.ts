import { Router } from "express";
import { db } from "@workspace/db";
import { tripsTable, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateTripBody,
  UpdateTripBody,
  GetTripParams,
  UpdateTripParams,
  DeleteTripParams,
  GetTripPnlParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/trips", async (req, res): Promise<void> => {
  try {
    const trips = await db
      .select()
      .from(tripsTable)
      .where(eq(tripsTable.userId, req.userId))
      .orderBy(tripsTable.createdAt);
    res.json(trips.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to list trips");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/trips", async (req, res): Promise<void> => {
  const parsed = CreateTripBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [trip] = await db
      .insert(tripsTable)
      .values({ ...parsed.data, userId: req.userId })
      .returning();
    res.status(201).json({ ...trip, createdAt: trip.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create trip");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trips/:id", async (req, res): Promise<void> => {
  const parsed = GetTripParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [trip] = await db
      .select()
      .from(tripsTable)
      .where(and(eq(tripsTable.id, parsed.data.id), eq(tripsTable.userId, req.userId)));
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }
    res.json({ ...trip, createdAt: trip.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to get trip");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/trips/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateTripParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateTripBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  try {
    const [trip] = await db
      .update(tripsTable)
      .set(bodyParsed.data)
      .where(and(eq(tripsTable.id, paramsParsed.data.id), eq(tripsTable.userId, req.userId)))
      .returning();
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }
    res.json({ ...trip, createdAt: trip.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to update trip");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/trips/:id", async (req, res): Promise<void> => {
  const parsed = DeleteTripParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db
      .delete(tripsTable)
      .where(and(eq(tripsTable.id, parsed.data.id), eq(tripsTable.userId, req.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete trip");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/trips/:id/pnl", async (req, res): Promise<void> => {
  const parsed = GetTripPnlParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [trip] = await db
      .select()
      .from(tripsTable)
      .where(and(eq(tripsTable.id, parsed.data.id), eq(tripsTable.userId, req.userId)));
    if (!trip) {
      res.status(404).json({ error: "Trip not found" });
      return;
    }

    const txs = await db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.tripId, parsed.data.id), eq(transactionsTable.userId, req.userId)));

    const currencies = [...new Set(txs.map((t) => t.currency))];
    if (!currencies.includes("AED")) currencies.unshift("AED");
    const breakdown = currencies
      .map((currency) => {
        const currTxs = txs.filter((t) => t.currency === currency);
        const revenue = currTxs.filter((t) => t.type === "income" || t.type === "receipt").reduce((s, t) => s + Number(t.amount), 0);
        const expenses = currTxs.filter((t) => t.type === "expense" || t.type === "payment").reduce((s, t) => s + Number(t.amount), 0);
        const netProfit = revenue - expenses;
        const myShare = trip.isShared ? netProfit / 2 : netProfit;
        return { currency, revenue, expenses, netProfit, myShare };
      })
      .filter((b) => b.revenue !== 0 || b.expenses !== 0);

    const enrichedTxs = txs.map((t) => ({
      ...t,
      amount: Number(t.amount),
      createdAt: t.createdAt.toISOString(),
    }));

    res.json({ trip: { ...trip, createdAt: trip.createdAt.toISOString() }, breakdown, transactions: enrichedTxs });
  } catch (err) {
    req.log.error({ err }, "Failed to get trip P&L");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
