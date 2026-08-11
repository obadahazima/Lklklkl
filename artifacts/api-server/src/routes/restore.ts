import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  clientsTable,
  tripsTable,
  accountsTable,
  transactionsTable,
} from "@workspace/db";
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

    const oldClientIdToNew = new Map<number, number>();
    const oldTripIdToNew = new Map<number, number>();
    const oldAccountIdToNew = new Map<number, number>();

    for (const row of clientRows) {
      const name = String(row[CLIENT_COLUMNS.name] ?? "").trim();
      if (!name) continue;
      const [inserted] = await db.insert(clientsTable).values({
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
      const [inserted] = await db.insert(tripsTable).values({
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
      const [inserted] = await db.insert(accountsTable).values({
        userId: uid,
        name,
        type: String(row[ACCOUNT_COLUMNS.type] ?? "cash"),
        currency,
        initialBalance: String(Number(row[ACCOUNT_COLUMNS.initialBalance] ?? 0)),
        notes: row[ACCOUNT_COLUMNS.notes] ? String(row[ACCOUNT_COLUMNS.notes]) : null,
      }).returning({ id: accountsTable.id });
      if (row[ACCOUNT_COLUMNS.id] != null && inserted) {
        oldAccountIdToNew.set(Number(row[ACCOUNT_COLUMNS.id]), inserted.id);
      }
    }

    let txCount = 0;
    for (const row of txRows) {
      const date = String(row[TX_COLUMNS.date] ?? "").trim();
      const type = String(row[TX_COLUMNS.type] ?? "").trim();
      const amount = Number(row[TX_COLUMNS.amount] ?? 0);
      const currency = String(row[TX_COLUMNS.currency] ?? "AED").trim();
      if (!date || !type || !currency) continue;

      const oldClientId = row[TX_COLUMNS.clientId] ? Number(row[TX_COLUMNS.clientId]) : null;
      const oldTripId = row[TX_COLUMNS.tripId] ? Number(row[TX_COLUMNS.tripId]) : null;
      const oldAccountId = row[TX_COLUMNS.accountId] ? Number(row[TX_COLUMNS.accountId]) : null;

      await db.insert(transactionsTable).values({
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
      });
      txCount++;
    }

    res.json({
      success: true,
      restored: {
        clients: oldClientIdToNew.size,
        trips: oldTripIdToNew.size,
        accounts: oldAccountIdToNew.size,
        transactions: txCount,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to restore backup");
    res.status(500).json({ error: "فشل استعادة النسخة الاحتياطية" });
  }
});

export default router;
