import { Router } from "express";
import { db } from "@workspace/db";
import { transactionsTable, clientsTable, tripsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { getExchangeRates, toAed } from "../utils/exchange-rates.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  try {
    const [txs, allClients, trips, rates] = await Promise.all([
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, req.userId)),
      db.select().from(clientsTable).where(eq(clientsTable.userId, req.userId)),
      db.select().from(tripsTable).where(eq(tripsTable.userId, req.userId)),
      getExchangeRates(),
    ]);

    const distinctCurrencies = [
      ...new Set(["AED", ...txs.map((t) => t.currency)]),
    ];

    const currencyData = distinctCurrencies.map((currency) => {
      const currTxs = txs.filter((t) => t.currency === currency);
      const totalIncome = currTxs
        .filter((t) => t.type === "income" || t.type === "receipt")
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpenses = currTxs
        .filter((t) => t.type === "expense" || t.type === "payment")
        .reduce((sum, t) => sum + Number(t.amount), 0);
      return { currency, totalIncome, totalExpenses, balance: totalIncome - totalExpenses };
    });

    const totalBalanceAED = currencyData.reduce(
      (sum, c) => sum + toAed(c.balance, c.currency, rates),
      0,
    );

    const pendingTransactions = txs.filter((t) => t.status === "pending").length;
    const activeTrips = trips.filter((t) => t.status === "active").length;

    res.json({
      currencies: currencyData,
      totalClients: allClients.length,
      totalTrips: trips.length,
      activeTrips,
      pendingTransactions,
      totalBalanceAED: Math.round(totalBalanceAED * 100) / 100,
      exchangeRates: rates,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get dashboard summary");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/exchange-rates", async (req, res): Promise<void> => {
  try {
    const rates = await getExchangeRates();
    res.json(rates);
  } catch (err) {
    req.log.error({ err }, "Failed to get exchange rates");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/recent-transactions", async (req, res): Promise<void> => {
  try {
    const txs = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, req.userId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(10);

    const clientIds = [...new Set(txs.map((t) => t.clientId).filter((id): id is number => id != null))];
    const tripIds = [...new Set(txs.map((t) => t.tripId).filter((id): id is number => id != null))];

    const [clientRows, tripRows] = await Promise.all([
      clientIds.length > 0
        ? db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable).where(inArray(clientsTable.id, clientIds))
        : [],
      tripIds.length > 0
        ? db.select({ id: tripsTable.id, name: tripsTable.name }).from(tripsTable).where(inArray(tripsTable.id, tripIds))
        : [],
    ]);

    const clientMap = new Map(clientRows.map((c) => [c.id, c.name]));
    const tripMap = new Map(tripRows.map((t) => [t.id, t.name]));

    const enriched = txs.map((t) => ({
      ...t,
      amount: Number(t.amount),
      clientName: t.clientId ? (clientMap.get(t.clientId) ?? null) : null,
      tripName: t.tripId ? (tripMap.get(t.tripId) ?? null) : null,
      studioName: null,
      createdAt: t.createdAt.toISOString(),
    }));

    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to get recent transactions");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
