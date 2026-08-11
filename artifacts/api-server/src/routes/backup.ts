import { Router } from "express";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  transactionsTable,
  clientsTable,
  tripsTable,
  accountsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { SHEET_NAMES, TX_COLUMNS, CLIENT_COLUMNS, TRIP_COLUMNS, ACCOUNT_COLUMNS } from "../lib/backup-columns.js";

const router = Router();

router.get("/backup", requireAuth, async (req, res): Promise<void> => {
  try {
    const uid = req.userId;

    const [transactions, clients, trips, accounts] = await Promise.all([
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, uid)),
      db.select().from(clientsTable).where(eq(clientsTable.userId, uid)),
      db.select().from(tripsTable).where(eq(tripsTable.userId, uid)),
      db.select().from(accountsTable).where(eq(accountsTable.userId, uid)),
    ]);

    const clientMap = new Map(clients.map((c) => [c.id, c.name]));
    const tripMap = new Map(trips.map((t) => [t.id, t.name]));
    const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

    const txRows = transactions.map((t) => ({
      [TX_COLUMNS.id]: t.id,
      [TX_COLUMNS.date]: t.date,
      [TX_COLUMNS.type]: t.type,
      [TX_COLUMNS.amount]: Number(t.amount),
      [TX_COLUMNS.currency]: t.currency,
      [TX_COLUMNS.clientName]: t.clientId ? (clientMap.get(t.clientId) ?? "") : "",
      [TX_COLUMNS.clientId]: t.clientId ?? "",
      [TX_COLUMNS.tripName]: t.tripId ? (tripMap.get(t.tripId) ?? "") : "",
      [TX_COLUMNS.tripId]: t.tripId ?? "",
      [TX_COLUMNS.accountName]: t.accountId ? (accountMap.get(t.accountId) ?? "") : "",
      [TX_COLUMNS.accountId]: t.accountId ?? "",
      [TX_COLUMNS.description]: t.description ?? "",
      [TX_COLUMNS.status]: t.status,
      [TX_COLUMNS.createdAt]: t.createdAt.toISOString(),
    }));

    const clientRows = clients.map((c) => ({
      [CLIENT_COLUMNS.id]: c.id,
      [CLIENT_COLUMNS.name]: c.name,
      [CLIENT_COLUMNS.phone]: c.phone ?? "",
      [CLIENT_COLUMNS.notes]: c.notes ?? "",
      [CLIENT_COLUMNS.createdAt]: c.createdAt.toISOString(),
    }));

    const tripRows = trips.map((t) => ({
      [TRIP_COLUMNS.id]: t.id,
      [TRIP_COLUMNS.name]: t.name,
      [TRIP_COLUMNS.shared]: t.isShared ? "نعم" : "لا",
      [TRIP_COLUMNS.status]: t.status,
      [TRIP_COLUMNS.notes]: t.notes ?? "",
      [TRIP_COLUMNS.createdAt]: t.createdAt.toISOString(),
    }));

    const accountRows = accounts.map((a) => ({
      [ACCOUNT_COLUMNS.id]: a.id,
      [ACCOUNT_COLUMNS.name]: a.name,
      [ACCOUNT_COLUMNS.type]: a.type,
      [ACCOUNT_COLUMNS.currency]: a.currency,
      [ACCOUNT_COLUMNS.initialBalance]: Number(a.initialBalance),
      [ACCOUNT_COLUMNS.notes]: a.notes ?? "",
      [ACCOUNT_COLUMNS.createdAt]: a.createdAt.toISOString(),
    }));

    const wb = XLSX.utils.book_new();

    const addSheet = (name: string, rows: Record<string, unknown>[]) => {
      const ws = rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([["لا توجد بيانات"]]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet(SHEET_NAMES.transactions, txRows);
    addSheet(SHEET_NAMES.clients, clientRows);
    addSheet(SHEET_NAMES.trips, tripRows);
    addSheet(SHEET_NAMES.accounts, accountRows);

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="backup-${date}.xlsx"`);
    res.send(buf);
  } catch (err) {
    req.log.error({ err }, "Failed to generate backup");
    res.status(500).json({ error: "فشل إنشاء النسخة الاحتياطية" });
  }
});

export default router;
