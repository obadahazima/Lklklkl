import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const studiosTable = pgTable("studios", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  name: text("name").notNull(),
  address: text("address"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const studioExpensesTable = pgTable("studio_expenses", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().default(""),
  studioId: integer("studio_id").notNull().references(() => studiosTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("AED"),
  date: text("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudioSchema = createInsertSchema(studiosTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudio = z.infer<typeof insertStudioSchema>;
export type Studio = typeof studiosTable.$inferSelect;

export const insertStudioExpenseSchema = createInsertSchema(studioExpensesTable).omit({ id: true, createdAt: true });
export type InsertStudioExpense = z.infer<typeof insertStudioExpenseSchema>;
export type StudioExpense = typeof studioExpensesTable.$inferSelect;
