import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { db } from "@workspace/db";
import { userSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/settings", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const rows = await db
      .select()
      .from(userSettingsTable)
      .where(eq(userSettingsTable.userId, userId))
      .limit(1);
    if (rows.length === 0) {
      return res.json(null);
    }
    return res.json(rows[0].settings);
  } catch (err) {
    return res.status(500).json({ error: "Failed to load settings" });
  }
});

router.put("/settings", requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const settings = req.body;
    await db
      .insert(userSettingsTable)
      .values({ userId, settings })
      .onConflictDoUpdate({
        target: userSettingsTable.userId,
        set: { settings },
      });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
