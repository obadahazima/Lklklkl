import { validateDebtLinks } from "../lib/debt-math.js";
import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  clientsTable,
  tripsTable,
  accountsTable,
  transactionsTable, transactionReceiptsTable,
} from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { SHEET_NAMES, TX_COLUMNS, CLIENT_COLUMNS, TRIP_COLUMNS, ACCOUNT_COLUMNS } from "../lib/backup-columns.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post("/restore", requireAuth, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "لم يتم رفع أي ملف" });
    return;
  }

  try {
    const uid = req.userId;
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });

    const getSheet = (name: string) => {
      const ws = wb.Sheets[name];
      if (!ws) return [] as Record<string, unknown>[];
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    };

    const clientRows = getSheet(SHEET_NAMES.clients);
    const tripRows = getSheet(SHEET_NAMES.trips);
    const accountRows = getSheet(SHEET_NAMES.accounts);
    const txRows = getSheet(SHEET_NAMES.transactions);

    // The client apps explicitly warn the user this *replaces* their current data — so it needs
    // to actually delete their existing rows first, not just insert on top (which silently
    // duplicated everything on every restore). Scoped to this user's own rows only, and wrapped
    // in one transaction so a failure partway through can't leave the account half-wiped.
    const restored = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billy.ledger.user'), hashtext(${uid}))`);
      await tx.delete(transactionReceiptsTable).where(eq(transactionReceiptsTable.userId,uid));
      await tx.delete(transactionsTable).where(eq(transactionsTable.userId, uid));
      await tx.delete(clientsTable).where(eq(clientsTable.userId, uid));
      await tx.delete(tripsTable).where(eq(tripsTable.userId, uid));
      await tx.delete(accountsTable).where(eq(accountsTable.userId, uid));

      const oldClientIdToNew = new Map<number, number>();
      const oldTripIdToNew = new Map<number, number>();
      const oldAccountIdToNew = new Map<number, number>();

      for (const row of clientRows) {
        const name = String(row[CLIENT_COLUMNS.name] ?? "").trim();
        if (!name) continue;
        const [inserted] = await tx.insert(clientsTable).values({
          userId: uid,
          name,
          phone: row[CLIENT_COLUMNS.phone] ? String(row[CLIENT_COLUMNS.phone]) : null,
          notes: row[CLIENT_COLUMNS.notes] ? String(row[CLIENT_COLUMNS.notes]) : null,
        }).returning({ id: clientsTable.id });
        if (row[CLIENT_COLUMNS.id] != null && inserted) {
          oldClientIdToNew.set(Number(row[CLIENT_COLUMNS.id]), inserted.id);
        }
      }

      for (const row of tripRows) {
        const name = String(row[TRIP_COLUMNS.name] ?? "").trim();
        if (!name) continue;
        const [inserted] = await tx.insert(tripsTable).values({
          userId: uid,
          name,
          isShared: row[TRIP_COLUMNS.shared] === "نعم",
          status: String(row[TRIP_COLUMNS.status] ?? "active"),
          notes: row[TRIP_COLUMNS.notes] ? String(row[TRIP_COLUMNS.notes]) : null,
        }).returning({ id: tripsTable.id });
        if (row[TRIP_COLUMNS.id] != null && inserted) {
          oldTripIdToNew.set(Number(row[TRIP_COLUMNS.id]), inserted.id);
        }
      }

      for (const row of accountRows) {
        const name = String(row[ACCOUNT_COLUMNS.name] ?? "").trim();
        const currency = String(row[ACCOUNT_COLUMNS.currency] ?? "").trim();
        if (!name || !currency) continue;
        const [inserted] = await tx.insert(accountsTable).values({
          userId: uid,
          name,
          type: String(row[ACCOUNT_COLUMNS.type] ?? "cash"),
          currency,
          position: Number.isSafeInteger(Number(row[ACCOUNT_COLUMNS.position])) && row[ACCOUNT_COLUMNS.position] !== "" && row[ACCOUNT_COLUMNS.position] != null ? Number(row[ACCOUNT_COLUMNS.position]) : 2147483647,
          openingBalanceDate: row[ACCOUNT_COLUMNS.openingBalanceDate] ? String(row[ACCOUNT_COLUMNS.openingBalanceDate]) : null,
          initialBalance: String(Number(row[ACCOUNT_COLUMNS.initialBalance] ?? 0)),
          creditLimit: row[ACCOUNT_COLUMNS.creditLimit] === "" || row[ACCOUNT_COLUMNS.creditLimit] == null ? null : String(Number(row[ACCOUNT_COLUMNS.creditLimit])), color: String(row[ACCOUNT_COLUMNS.color] || "#3B82F6"),
          notes: row[ACCOUNT_COLUMNS.notes] ? String(row[ACCOUNT_COLUMNS.notes]) : null,
        }).returning({ id: accountsTable.id });
        if (row[ACCOUNT_COLUMNS.id] != null && inserted) {
          oldAccountIdToNew.set(Number(row[ACCOUNT_COLUMNS.id]), inserted.id);
        }
      }

      let txCount = 0;
      const transactionIds = new Map<number,number>();
      const pendingAllocations: {id:number; allocations:{debtId:number;amount:number}[]}[] = [];
      for (const row of txRows) {
        const date = String(row[TX_COLUMNS.date] ?? "").trim();
        const type = String(row[TX_COLUMNS.type] ?? "").trim();
        const amount = Number(row[TX_COLUMNS.amount] ?? 0);
        const currency = String(row[TX_COLUMNS.currency] ?? "AED").trim();
        if (!date || !type || !currency) continue;

        const oldClientId = row[TX_COLUMNS.clientId] ? Number(row[TX_COLUMNS.clientId]) : null;
        const oldTripId = row[TX_COLUMNS.tripId] ? Number(row[TX_COLUMNS.tripId]) : null;
        const oldAccountId = row[TX_COLUMNS.accountId] ? Number(row[TX_COLUMNS.accountId]) : null;

        const [saved] = await tx.insert(transactionsTable).values({
          userId: uid,
          date,
          type,
          amount: String(amount),
          currency,
          clientId: oldClientId ? (oldClientIdToNew.get(oldClientId) ?? null) : null,
          tripId: oldTripId ? (oldTripIdToNew.get(oldTripId) ?? null) : null,
          accountId: oldAccountId ? (oldAccountIdToNew.get(oldAccountId) ?? null) : null,
          description: row[TX_COLUMNS.description] ? String(row[TX_COLUMNS.description]) : null,
          status: String(row[TX_COLUMNS.status] ?? "pending"),
          includedInOpeningBalance: row[TX_COLUMNS.includedInOpeningBalance] === "نعم", destinationIncludedInOpeningBalance: row[TX_COLUMNS.destinationIncludedInOpeningBalance] === "نعم",
          debtKind: row[TX_COLUMNS.debtKind] ? String(row[TX_COLUMNS.debtKind]) : null,
          dueDate: row[TX_COLUMNS.dueDate] ? String(row[TX_COLUMNS.dueDate]) : null,
          toAccountId: row[TX_COLUMNS.toAccountId] ? oldAccountIdToNew.get(Number(row[TX_COLUMNS.toAccountId])) ?? null : null,
        }).returning();
        transactionIds.set(Number(row[TX_COLUMNS.id]),saved.id);
        const allocations = JSON.parse(String(row[TX_COLUMNS.allocations] || "[]"));
        if (!Array.isArray(allocations) || allocations.some(a=>!Number.isInteger(a.debtId)||!Number.isFinite(a.amount)||a.amount<=0)) throw new Error("Invalid collection allocation");
        pendingAllocations.push({id:saved.id,allocations});
        txCount++;
      }

      for (const item of pendingAllocations) {
        const allocations = item.allocations.map(a=> { const debtId=transactionIds.get(a.debtId); if(!debtId) throw new Error("Missing receivable in backup"); return {debtId,amount:a.amount}; });
        await tx.update(transactionsTable).set({allocations}).where(and(eq(transactionsTable.id,item.id),eq(transactionsTable.userId,uid)));
      }
      const restoredRows=await tx.select().from(transactionsTable).where(eq(transactionsTable.userId,uid));
      if(!validateDebtLinks(restoredRows))throw new Error("Invalid debt allocation links in backup");
      return {
        clients: oldClientIdToNew.size,
        trips: oldTripIdToNew.size,
        accounts: oldAccountIdToNew.size,
        transactions: txCount,
      };
    });

    res.json({ success: true, restored });
  } catch (err) {
    req.log.error({ err }, "Failed to restore backup");
    res.status(500).json({ error: "فشل استعادة النسخة الاحتياطية" });
  }
});

export default router;
