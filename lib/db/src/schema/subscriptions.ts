import { pgTable, text, timestamp, boolean, bigint } from "drizzle-orm/pg-core";

/**
 * One row per user. Source of truth for "is this user premium?", kept in sync by the
 * RevenueCat webhook (covers Google Play Billing and Stripe/web purchases alike).
 * `userId` is the Clerk user id, which the clients pass to RevenueCat as the app user id.
 */
export const subscriptionsTable = pgTable("subscriptions", {
  userId: text("user_id").primaryKey(),
  // "active" | "cancelled" (will not renew, still active until expiresAt) | "billing_issue" | "expired"
  status: text("status").notNull().default("expired"),
  productId: text("product_id"),
  store: text("store"), // PLAY_STORE | STRIPE | RC_BILLING | ...
  isTrial: boolean("is_trial").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  // Timestamp (ms) of the last RevenueCat event applied; older/duplicate events are ignored.
  lastEventMs: bigint("last_event_ms", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SubscriptionRow = typeof subscriptionsTable.$inferSelect;
