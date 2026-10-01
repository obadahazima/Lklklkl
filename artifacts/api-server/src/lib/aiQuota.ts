import { db } from "@workspace/db";
import { aiUsageTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { getSubscription } from "./subscription.js";

/**
 * Free-tier daily limit for AI assistant calls (chat, voice parsing, transcription).
 * Controlled by env FREE_AI_DAILY_LIMIT. 0 / unset = unlimited (feature OFF), so deploying
 * this changes nothing until you set it. Premium users are never limited.
 */
export function freeAiDailyLimit(): number {
  const n = Number(process.env.FREE_AI_DAILY_LIMIT ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export const aiQuota = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const limit = freeAiDailyLimit();
  if (limit === 0) return next();
  try {
    if ((await getSubscription(req.userId)).premium) return next();
    const day = new Date().toISOString().slice(0, 10);
    // Atomic increment-then-check so concurrent requests can't slip past the limit.
    const [row] = await db
      .insert(aiUsageTable)
      .values({ userId: req.userId, day, count: 1 })
      .onConflictDoUpdate({
        target: [aiUsageTable.userId, aiUsageTable.day],
        set: { count: sql`${aiUsageTable.count} + 1` },
      })
      .returning({ count: aiUsageTable.count });
    if (row.count > limit) {
      res.status(402).json({ error: "ai_limit_reached", limit, resetsAt: `${day}T24:00:00Z` });
      return;
    }
    next();
  } catch (err) {
    // Never block the user because our counter failed.
    req.log.error({ err }, "AI quota check failed; allowing request");
    next();
  }
};

/** Remaining free calls today, for showing "3 of 10 left" in the clients. null = unlimited. */
export async function aiUsageToday(userId: string): Promise<{ used: number; limit: number | null }> {
  const limit = freeAiDailyLimit();
  const day = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .select({ count: aiUsageTable.count })
    .from(aiUsageTable)
    .where(and(eq(aiUsageTable.userId, userId), eq(aiUsageTable.day, day)));
  return { used: row?.count ?? 0, limit: limit === 0 ? null : limit };
}
