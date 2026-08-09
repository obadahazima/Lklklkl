import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { tripsTable } from "./trips";
import { studiosTable } from "./studios";
import { accountsTable } from "./accounts";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  date: text("date").notNull(),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  tripId: integer("trip_id").references(() => tripsTable.id, { onDelete: "set null" }),
  studioId: integer("studio_id").references(() => studiosTable.id, { onDelete: "set null" }),
  // Nullable at the DB level so historical transactions predating this feature stay valid, but
  // the app enforces this as required for every new transaction (manual form + Billy).
  accountId: integer("account_id").references(() => accountsTable.id, { onDelete: "set null" }),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
