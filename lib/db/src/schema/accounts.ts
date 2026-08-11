import { pgTable, text, serial, timestamp, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// type: "cash" | "debit" | "credit"
export const accountsTable = pgTable("accounts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  type: text("type").notNull(),
  currency: text("currency").notNull(),
  // Hex color (e.g. "#3B82F6") the user picks per account, used as a visual identifier across
  // the accounts list and dashboard. Defaults to a neutral blue so existing/older rows and any
  // insert that omits it still render consistently instead of falling back to undefined.
  color: text("color").notNull().default("#3B82F6"),
  initialBalance: numeric("initial_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAccountSchema = createInsertSchema(accountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Account = typeof accountsTable.$inferSelect;
