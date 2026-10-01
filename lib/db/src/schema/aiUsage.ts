import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";

/** Per-user, per-UTC-day counter of AI assistant calls (used for the free-tier daily limit). */
export const aiUsageTable = pgTable(
  "ai_usage",
  {
    userId: text("user_id").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD (UTC)
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
