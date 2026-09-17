import { Router } from "express";
import { db } from "@workspace/db";
import { accountsTable, transactionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateAccountBody,
  UpdateAccountBody,
  GetAccountParams,
  UpdateAccountParams,
  DeleteAccountParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getEffectiveRates, type AllRates } from "../utils/exchange-rates.js";

const router = Router();

router.use(requireAuth);

/**
 * Converts an amount from one currency to another using AED as the pivot
 * (rates[code] = how many AED one unit of `code` is worth).
 * Falls back to a 1:1 conversion (with a warning) if either currency has no known rate,
 * so a missing rate degrades gracefully instead of throwing or silently corrupting the balance.
 */
function convertAmount(amount: number, from: string, to: string, rates: AllRates): number {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) {
    console.warn(`[accounts] Missing exchange rate for ${from} or ${to} — treating as 1:1, balance may be inaccurate.`);
    return amount;
  }
  return (amount * fromRate) / toRate;
}

/**
 * current balance = initialBalance
 *   + income/receipt through this account (money in)
 *   - expense/payment through this account (money out)
 *   - transfer where this account is the source (accountId) — money left
 *   + transfer where this account is the destination (toAccountId) — money arrived
 *
 * Every transaction is stored with its own currency (a transaction doesn't have to match the
 * account's currency — e.g. paying "100 USD" out of an AED account is allowed). Before applying
 * a transaction's amount to this account's balance, it's converted from the transaction's
 * currency into this account's own currency using the current exchange rate — otherwise a
 * mismatched-currency transaction would be subtracted/added at face value, which silently
 * corrupts the balance (e.g. deducting 100 AED for a 100 USD payment).
 */
async function computeBalance(
  userId: string,
  accountId: number,
  initialBalance: number,
  accountCurrency: string,
  rates: AllRates,
): Promise<number> {
  const [outgoing, incomingTransfers] = await Promise.all([
    db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.accountId, accountId), eq(transactionsTable.userId, userId))),
    db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.toAccountId, accountId), eq(transactionsTable.userId, userId), eq(transactionsTable.type, "transfer"))),
  ]);
  const delta = outgoing.reduce((sum, t) => {
    const amt = convertAmount(Number(t.amount), t.currency, accountCurrency, rates);
    if (t.type === "transfer") return sum - amt; // money left this account, regardless of income/expense bucket
    return sum + (t.type === "income" || t.type === "receipt" ? amt : -amt);
  }, 0);
  const incomingDelta = incomingTransfers.reduce(
    (sum, t) => sum + convertAmount(Number(t.amount), t.currency, accountCurrency, rates),
    0,
  );
  return Math.round((initialBalance + delta + incomingDelta) * 100) / 100;
}

router.get("/accounts", async (req, res): Promise<void> => {
  try {
    const [accounts, rates] = await Promise.all([
      db
        .select()
        .from(accountsTable)
        .where(eq(accountsTable.userId, req.userId))
        .orderBy(accountsTable.name),
      getEffectiveRates(req.userId),
    ]);
    const withBalances = await Promise.all(
      accounts.map(async (a) => ({
        ...a,
        initialBalance: Number(a.initialBalance),
        currentBalance: await computeBalance(req.userId, a.id, Number(a.initialBalance), a.currency, rates),
        createdAt: a.createdAt.toISOString(),
      })),
    );
    res.json(withBalances);
  } catch (err) {
    req.log.error({ err }, "Failed to list accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [account] = await db
      .insert(accountsTable)
      .values({
        ...parsed.data,
        color: parsed.data.color ?? "#3B82F6",
        initialBalance: String(parsed.data.initialBalance ?? 0),
        userId: req.userId,
      })
      .returning();
    res.status(201).json({
      ...account,
      initialBalance: Number(account.initialBalance),
      currentBalance: Number(account.initialBalance),
      createdAt: account.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create account");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/accounts/:id", async (req, res): Promise<void> => {
  const parsed = GetAccountParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [account] = await db
      .select()
      .from(accountsTable)
      .where(and(eq(accountsTable.id, parsed.data.id), eq(accountsTable.userId, req.userId)));
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const rates = await getEffectiveRates(req.userId);
    res.json({
      ...account,
      initialBalance: Number(account.initialBalance),
      currentBalance: await computeBalance(req.userId, account.id, Number(account.initialBalance), account.currency, rates),
      createdAt: account.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get account");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/accounts/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateAccountParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateAccountBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  try {
    const updateData: Record<string, unknown> = { ...bodyParsed.data };
    if (bodyParsed.data.initialBalance !== undefined) {
      updateData.initialBalance = String(bodyParsed.data.initialBalance);
    }
    const [account] = await db
      .update(accountsTable)
      .set(updateData)
      .where(and(eq(accountsTable.id, paramsParsed.data.id), eq(accountsTable.userId, req.userId)))
      .returning();
    if (!account) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    const rates = await getEffectiveRates(req.userId);
    res.json({
      ...account,
      initialBalance: Number(account.initialBalance),
      currentBalance: await computeBalance(req.userId, account.id, Number(account.initialBalance), account.currency, rates),
      createdAt: account.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update account");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/accounts/:id", async (req, res): Promise<void> => {
  const parsed = DeleteAccountParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db
      .delete(accountsTable)
      .where(and(eq(accountsTable.id, parsed.data.id), eq(accountsTable.userId, req.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete account");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
