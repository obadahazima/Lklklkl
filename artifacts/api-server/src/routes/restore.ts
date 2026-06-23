import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  clientsTable,
  tripsTable,
  studiosTable,
  transactionsTable,
  studioExpensesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";

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

    const clientRows = getSheet("الزبائن");
    const tripRows = getSheet("الرحلات");
    const studioRows = getSheet("الاستديوهات");
    const txRows = getSheet("المعاملات");
    const expenseRows = getSheet("مصاريف الاستديوهات");

    const oldClientIdToNew = new Map<number, number>();
    const oldTripIdToNew = new Map<number, number>();
    const oldStudioIdToNew = new Map<number, number>();

    for (const row of clientRows) {
      const name = String(row["الاسم"] ?? "").trim();
      if (!name) continue;
      const [inserted] = await db.insert(clientsTable).values({
        userId: uid,
        name,
        phone: row["الهاتف"] ? String(row["الهاتف"]) : null,
        notes: row["ملاحظات"] ? String(row["ملاحظات"]) : null,
      }).returning({ id: clientsTable.id });
      if (row["رقم"] != null && inserted) {
        oldClientIdToNew.set(Number(row["رقم"]), inserted.id);
      }
    }

    for (const row of tripRows) {
      const name = String(row["الاسم"] ?? "").trim();
      if (!name) continue;
      const [inserted] = await db.insert(tripsTable).values({
        userId: uid,
        name,
        isShared: row["مشترك"] === "نعم",
        status: String(row["الحالة"] ?? "active"),
        notes: row["ملاحظات"] ? String(row["ملاحظات"]) : null,
      }).returning({ id: tripsTable.id });
      if (row["رقم"] != null && inserted) {
        oldTripIdToNew.set(Number(row["رقم"]), inserted.id);
      }
    }

    for (const row of studioRows) {
      const name = String(row["الاسم"] ?? "").trim();
      if (!name) continue;
      const [inserted] = await db.insert(studiosTable).values({
        userId: uid,
        name,
        address: row["العنوان"] ? String(row["العنوان"]) : null,
        notes: row["ملاحظات"] ? String(row["ملاحظات"]) : null,
      }).returning({ id: studiosTable.id });
      if (row["رقم"] != null && inserted) {
        oldStudioIdToNew.set(Number(row["رقم"]), inserted.id);
      }
    }

    let txCount = 0;
    for (const row of txRows) {
      const date = String(row["التاريخ"] ?? "").trim();
      const type = String(row["النوع"] ?? "").trim();
      const amount = Number(row["المبلغ"] ?? 0);
      const currency = String(row["العملة"] ?? "AED").trim();
      if (!date || !type || !currency) continue;

      const oldClientId = row["رقم الزبون"] ? Number(row["رقم الزبون"]) : null;
      const oldTripId = row["رقم الرحلة"] ? Number(row["رقم الرحلة"]) : null;
      const oldStudioId = row["رقم الاستديو"] ? Number(row["رقم الاستديو"]) : null;

      await db.insert(transactionsTable).values({
        userId: uid,
        date,
        type,
        amount: String(amount),
        currency,
        clientId: oldClientId ? (oldClientIdToNew.get(oldClientId) ?? null) : null,
        tripId: oldTripId ? (oldTripIdToNew.get(oldTripId) ?? null) : null,
        studioId: oldStudioId ? (oldStudioIdToNew.get(oldStudioId) ?? null) : null,
        description: row["الوصف"] ? String(row["الوصف"]) : null,
        status: String(row["الحالة"] ?? "pending"),
      });
      txCount++;
    }

    for (const row of expenseRows) {
      const oldStudioId = row["رقم الاستديو"] ? Number(row["رقم الاستديو"]) : null;
      const newStudioId = oldStudioId ? oldStudioIdToNew.get(oldStudioId) : null;
      if (!newStudioId) continue;
      const category = String(row["الفئة"] ?? "").trim();
      const date = String(row["التاريخ"] ?? "").trim();
      if (!category || !date) continue;
      await db.insert(studioExpensesTable).values({
        userId: uid,
        studioId: newStudioId,
        category,
        amount: String(Number(row["المبلغ"] ?? 0)),
        currency: String(row["العملة"] ?? "AED"),
        date,
        notes: row["ملاحظات"] ? String(row["ملاحظات"]) : null,
      });
    }

    res.json({
      success: true,
      restored: {
        clients: oldClientIdToNew.size,
        trips: oldTripIdToNew.size,
        studios: oldStudioIdToNew.size,
        transactions: txCount,
        expenses: expenseRows.length,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to restore backup");
    res.status(500).json({ error: "فشل استعادة النسخة الاحتياطية" });
  }
});

export default router;
