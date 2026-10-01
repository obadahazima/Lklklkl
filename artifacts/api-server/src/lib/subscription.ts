import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

export type SubscriptionInfo = {
  premium: boolean;
  status: string;
  productId: string | null;
  isTrial: boolean;
  expiresAt: string | null;
  willRenew: boolean;
};

/** Premium = has a non-expired period. A cancelled sub stays premium until it runs out. */
export async function getSubscription(userId: string): Promise<SubscriptionInfo> {
  const [row] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));
  const now = Date.now();
  const inPeriod = !!row?.expiresAt && row.expiresAt.getTime() > now;
  // billing_issue gets the store's grace period; expiresAt covers it.
  const premium = !!row && row.status !== "expired" && inPeriod;
  return {
    premium,
    status: row ? (premium ? row.status : "expired") : "none",
    productId: row?.productId ?? null,
    isTrial: premium && !!row?.isTrial,
    expiresAt: row?.expiresAt ? row.expiresAt.toISOString() : null,
    willRenew: premium && row?.status === "active",
  };
}

/**
 * Route guard for premium-only endpoints. NOT applied anywhere yet — once you decide which
 * features are premium, add it after requireAuth, e.g.
 *   router.get("/reports/advanced", requireAuth, requirePremium, handler)
 * Clients get 402 + { error: "premium_required" } and should open the paywall.
 */
export const requirePremium = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if ((await getSubscription(req.userId)).premium) return next();
    res.status(402).json({ error: "premium_required" });
  } catch {
    res.status(500).json({ error: "Failed to verify subscription" });
  }
};
