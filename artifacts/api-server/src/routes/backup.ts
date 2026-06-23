import { Router } from "express";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import {
  transactionsTable,
  clientsTable,
  tripsTable,
  studiosTable,
  studioExpensesTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/backup", requireAuth, async (req, res): Promise<void> => {
  try {
    const uid = req.userId;

    const [transactions, clients, trips, studios, expenses] = await Promise.all([
      db.select().from(transactionsTable).where(eq(transactionsTable.userId, uid)),
      db.select().from(clientsTable).where(eq(clientsTable.userId, uid)),
      db.select().from(tripsTable).where(eq(tripsTable.userId, uid)),
      db.select().from(studiosTable).where(eq(studiosTable.userId, uid)),
      db.select().from(studioExpensesTable).where(eq(studioExpensesTable.userId, uid)),
    ]);

    const clientMap = new Map(clients.map((c) => [c.id, c.name]));
    const tripMap = new Map(trips.map((t) => [t.id, t.name]));
    const studioMap = new Map(studios.map((s) => [s.id, s.name]));

    const txRows = transactions.map((t) => ({
      "رقم": t.id,
      "التاريخ": t.date,
      "النوع": t.type,
      "المبلغ": Number(t.amount),
      "العملة": t.currency,
      "الزبون": t.clientId ? (clientMap.get(t.clientId) ?? "") : "",
      "الرحلة": t.tripId ? (tripMap.get(t.tripId) ?? "") : "",
      "الاستديو": t.studioId ? (studioMap.get(t.studioId) ?? "") : "",
      "الوصف": t.description ?? "",
      "الحالة": t.status,
      "تاريخ الإنشاء": t.createdAt.toISOString(),
    }));

    const clientRows = clients.map((c) => ({
      "رقم": c.id,
      "الاسم": c.name,
      "الهاتف": c.phone ?? "",
      "ملاحظات": c.notes ?? "",
      "تاريخ الإنشاء": c.createdAt.toISOString(),
    }));

    const tripRows = trips.map((t) => ({
      "رقم": t.id,
      "الاسم": t.name,
      "مشترك": t.isShared ? "نعم" : "لا",
      "الحالة": t.status,
      "ملاحظات": t.notes ?? "",
      "تاريخ الإنشاء": t.createdAt.toISOString(),
    }));

    const studioRows = studios.map((s) => ({
      "رقم": s.id,
      "الاسم": s.name,
      "العنوان": s.address ?? "",
      "ملاحظات": s.notes ?? "",
      "تاريخ الإنشاء": s.createdAt.toISOString(),
    }));

    const expenseRows = expenses.map((e) => ({
      "رقم": e.id,
      "الاستديو": studioMap.get(e.studioId) ?? "",
      "الفئة": e.category,
      "المبلغ": Number(e.amount),
      "العملة": e.currency,
      "التاريخ": e.date,
      "ملاحظات": e.notes ?? "",
      "تاريخ الإنشاء": e.createdAt.toISOString(),
    }));

    const wb = XLSX.utils.book_new();

    const addSheet = (name: string, rows: Record<string, unknown>[]) => {
      const ws = rows.length > 0
        ? XLSX.utils.json_to_sheet(rows)
        : XLSX.utils.aoa_to_sheet([["لا توجد بيانات"]]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet("المعاملات", txRows);
    addSheet("الزبائن", clientRows);
    addSheet("الرحلات", tripRows);
    addSheet("الاستديوهات", studioRows);
    addSheet("مصاريف الاستديوهات", expenseRows);

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
