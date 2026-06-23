import { Router } from "express";
import { db } from "@workspace/db";
import { studiosTable, studioExpensesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateStudioBody,
  UpdateStudioBody,
  GetStudioParams,
  UpdateStudioParams,
  ListStudioExpensesParams,
  CreateStudioExpenseParams,
  CreateStudioExpenseBody,
  DeleteStudioExpenseParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/studios", async (req, res): Promise<void> => {
  try {
    const studios = await db
      .select()
      .from(studiosTable)
      .where(eq(studiosTable.userId, req.userId))
      .orderBy(studiosTable.name);
    res.json(studios.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to list studios");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/studios", async (req, res): Promise<void> => {
  const parsed = CreateStudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [studio] = await db
      .insert(studiosTable)
      .values({ ...parsed.data, userId: req.userId })
      .returning();
    res.status(201).json({ ...studio, createdAt: studio.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create studio");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/studios/:id", async (req, res): Promise<void> => {
  const parsed = GetStudioParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const [studio] = await db
      .select()
      .from(studiosTable)
      .where(and(eq(studiosTable.id, parsed.data.id), eq(studiosTable.userId, req.userId)));
    if (!studio) {
      res.status(404).json({ error: "Studio not found" });
      return;
    }
    res.json({ ...studio, createdAt: studio.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to get studio");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/studios/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateStudioParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateStudioBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  try {
    const [studio] = await db
      .update(studiosTable)
      .set(bodyParsed.data)
      .where(and(eq(studiosTable.id, paramsParsed.data.id), eq(studiosTable.userId, req.userId)))
      .returning();
    if (!studio) {
      res.status(404).json({ error: "Studio not found" });
      return;
    }
    res.json({ ...studio, createdAt: studio.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to update studio");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/studios/:id/expenses", async (req, res): Promise<void> => {
  const parsed = ListStudioExpensesParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    const expenses = await db
      .select()
      .from(studioExpensesTable)
      .where(and(eq(studioExpensesTable.studioId, parsed.data.id), eq(studioExpensesTable.userId, req.userId)))
      .orderBy(studioExpensesTable.date);
    res.json(expenses.map((e) => ({ ...e, amount: Number(e.amount), createdAt: e.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to list studio expenses");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/studios/:id/expenses", async (req, res): Promise<void> => {
  const paramsParsed = CreateStudioExpenseParams.safeParse({ id: Number(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = CreateStudioExpenseBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  try {
    const [expense] = await db
      .insert(studioExpensesTable)
      .values({
        userId: req.userId,
        studioId: paramsParsed.data.id,
        category: bodyParsed.data.category,
        amount: String(bodyParsed.data.amount),
        currency: bodyParsed.data.currency,
        date: bodyParsed.data.date,
        notes: bodyParsed.data.notes ?? null,
      })
      .returning();
    res.status(201).json({ ...expense, amount: Number(expense.amount), createdAt: expense.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create studio expense");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/studios/:id", async (req, res): Promise<void> => {
  const parsed = GetStudioParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db
      .delete(studiosTable)
      .where(and(eq(studiosTable.id, parsed.data.id), eq(studiosTable.userId, req.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete studio");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/studios/expenses/:expenseId", async (req, res): Promise<void> => {
  const parsed = DeleteStudioExpenseParams.safeParse({ expenseId: Number(req.params.expenseId) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  try {
    await db
      .delete(studioExpensesTable)
      .where(and(eq(studioExpensesTable.id, parsed.data.expenseId), eq(studioExpensesTable.userId, req.userId)));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete studio expense");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
