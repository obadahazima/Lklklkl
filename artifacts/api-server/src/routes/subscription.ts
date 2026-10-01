import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";
import { getSubscription } from "../lib/subscription.js";
import { aiUsageToday } from "../lib/aiQuota.js";

const router = Router();

/** The single place every client (mobile, web) asks "is this user premium?". */
router.get("/subscription/status", requireAuth, async (req, res): Promise<void> => {
  try {
    const [sub, ai] = await Promise.all([getSubscription(req.userId), aiUsageToday(req.userId)]);
    // ai.limit === null means no free-tier limit is configured; premium users ignore it.
    res.json({ ...sub, ai });
  } catch (err) {
    req.log.error({ err }, "Failed to read subscription");
    res.status(500).json({ error: "Failed to read subscription" });
  }
});

function authorized(header: string | undefined): boolean {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * RevenueCat webhook. In the RevenueCat dashboard set the URL to
 * https://<api-host>/api/webhooks/revenuecat and the Authorization header value to the same
 * string as the REVENUECAT_WEBHOOK_AUTH env var.
 */
router.post("/webhooks/revenuecat", async (req, res): Promise<void> => {
  if (!authorized(req.header("authorization"))) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const ev = req.body?.event;
  if (!ev || typeof ev.type !== "string") {
    res.status(400).json({ error: "Bad payload" });
    return;
  }
  // Test pings and anonymous ids carry nothing we can attach to a user.
  const userId: string | undefined = ev.app_user_id;
  if (ev.type === "TEST" || !userId || userId.startsWith("$RCAnonymousID")) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }

  try {
    const eventMs = Number(ev.event_timestamp_ms) || Date.now();
    const [existing] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));
    if (existing && existing.lastEventMs >= eventMs) {
      res.status(200).json({ ok: true, stale: true });
      return;
    }

    const expiresAt = ev.expiration_at_ms ? new Date(Number(ev.expiration_at_ms)) : existing?.expiresAt ?? null;
    let status: string;
    switch (ev.type) {
      case "CANCELLATION":
        status = "cancelled";
        break;
      case "EXPIRATION":
        status = "expired";
        break;
      case "BILLING_ISSUE":
        status = "billing_issue";
        break;
      default:
        // INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, PRODUCT_CHANGE, NON_RENEWING_PURCHASE, ...
        status = "active";
    }

    const values = {
      userId,
      status,
      productId: ev.product_id ?? existing?.productId ?? null,
      store: ev.store ?? existing?.store ?? null,
      isTrial: ev.period_type === "TRIAL",
      expiresAt,
      lastEventMs: eventMs,
    };
    await db
      .insert(subscriptionsTable)
      .values(values)
      .onConflictDoUpdate({ target: subscriptionsTable.userId, set: values });
    res.status(200).json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "RevenueCat webhook failed");
    // 5xx makes RevenueCat retry, which is what we want for transient DB errors.
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
