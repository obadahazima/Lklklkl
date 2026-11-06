import { pgTable, text, uuid, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";

/** Durable acknowledgements survive lost HTTP responses and transaction deletion. */
export const transactionReceiptsTable = pgTable("transaction_receipts", {
  userId: text("user_id").notNull(),
  requestId: uuid("request_id").notNull(),
  payloadHash: text("payload_hash").notNull(),
  response: jsonb("response").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [primaryKey({ columns: [table.userId, table.requestId] })]);
