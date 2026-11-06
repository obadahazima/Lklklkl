import { saveAccountOrder } from "../lib/account-order.js";
import { validISODate } from "../lib/voice-input.js";
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

import { validAccountAmount, creditOpeningBalance } from "../lib/account-credit.js";

function validAmounts(body: { initialBalance?: number; creditLimit?: number | null }) {
  return (body.initialBalance === undefined || validAccountAmount(body.initialBalance)) &&
    (body.creditLimit == null || (validAccountAmount(body.creditLimit) && body.creditLimit >= 0));
}

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
  openingBalanceDate: string | null = null,
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
    if (t.includedInOpeningBalance || (openingBalanceDate && t.date < openingBalanceDate)) return sum;
    if (t.type === "receivable" && t.debtKind !== "loan_now") return sum;
    const amt = convertAmount(Number(t.amount), t.currency, accountCurrency, rates);
    if (t.type === "transfer") return sum - amt; // money left this account, regardless of income/expense bucket
    return sum + (t.type === "income" || t.type === "receipt" ? amt : -amt);
  }, 0);
  const incomingDelta = incomingTransfers.reduce(
    (sum, t) => sum + ((t.destinationIncludedInOpeningBalance || (openingBalanceDate && t.date < openingBalanceDate)) ? 0 : convertAmount(Number(t.amount), t.currency, accountCurrency, rates)),
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
        .orderBy(accountsTable.position, accountsTable.name, accountsTable.id),
      getEffectiveRates(req.userId),
    ]);
    const withBalances = await Promise.all(
      accounts.map(async (a) => ({
        ...a,
        initialBalance: Number(a.initialBalance),
        creditLimit: a.creditLimit == null ? null : Number(a.creditLimit),
        currentBalance: await computeBalance(req.userId, a.id, Number(a.initialBalance), a.currency, rates, a.openingBalanceDate),
        createdAt: a.createdAt.toISOString(),
      })),
    );
    res.json(withBalances);
  } catch (err) {
    req.log.error({ err }, "Failed to list accounts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/accounts/reorder",async(req,res):Promise<void>=>{
 const ids:unknown=req.body?.accountIds;
 if(!Array.isArray(ids)||ids.length>5000||ids.some(id=>!Number.isSafeInteger(id)||id<=0)){res.status(400).json({error:"Invalid account order"});return;}
 try{if(!await saveAccountOrder(req.userId,ids)){res.status(409).json({error:"تغيّرت قائمة الحسابات؛ حدّثها ثم أعد ترتيبها"});return;}res.json({accountIds:ids});}
 catch(err){req.log.error({err},"Failed to reorder accounts");res.status(500).json({error:"تعذر حفظ ترتيب الحسابات"});}
});

router.post("/accounts", async (req, res): Promise<void> => {
  const parsed = CreateAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.openingBalanceDate && !validISODate(parsed.data.openingBalanceDate)) { res.status(400).json({error:"Invalid opening balance date"}); return; }
  if (!validAmounts(parsed.data)) { res.status(400).json({ error: "Invalid account amount or credit limit" }); return; }
  try {
    const [account] = await db
      .insert(accountsTable)
      .values({
        ...parsed.data,
        color: parsed.data.color ?? "#3B82F6",
        initialBalance: String(creditOpeningBalance(parsed.data.type, parsed.data.initialBalance ?? 0)),
        creditLimit: parsed.data.type === "credit" && parsed.data.creditLimit != null ? String(parsed.data.creditLimit) : null,
        userId: req.userId,
      })
      .returning();
    res.status(201).json({
      ...account,
      initialBalance: Number(account.initialBalance),
      creditLimit: account.creditLimit == null ? null : Number(account.creditLimit),
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
      creditLimit: account.creditLimit == null ? null : Number(account.creditLimit),
      currentBalance: await computeBalance(req.userId, account.id, Number(account.initialBalance), account.currency, rates, account.openingBalanceDate),
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
  if (bodyParsed.data.openingBalanceDate && !validISODate(bodyParsed.data.openingBalanceDate)) { res.status(400).json({error:"Invalid opening balance date"}); return; }
  if (!validAmounts(bodyParsed.data)) { res.status(400).json({ error: "Invalid account amount or credit limit" }); return; }
  try {
    const [existing] = await db.select().from(accountsTable).where(and(eq(accountsTable.id, paramsParsed.data.id), eq(accountsTable.userId, req.userId)));
    if (!existing) { res.status(404).json({ error: "Account not found" }); return; }
    const effectiveType = bodyParsed.data.type ?? existing.type;
    const updateData: Record<string, unknown> = { ...bodyParsed.data };
    if (bodyParsed.data.initialBalance !== undefined) {
      updateData.initialBalance = String(creditOpeningBalance(effectiveType, bodyParsed.data.initialBalance));
    }
    if (effectiveType !== "credit") updateData.creditLimit = null;
    else if (bodyParsed.data.creditLimit !== undefined) updateData.creditLimit = bodyParsed.data.creditLimit === null ? null : String(bodyParsed.data.creditLimit);
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
      creditLimit: account.creditLimit == null ? null : Number(account.creditLimit),
      currentBalance: await computeBalance(req.userId, account.id, Number(account.initialBalance), account.currency, rates, account.openingBalanceDate),
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
