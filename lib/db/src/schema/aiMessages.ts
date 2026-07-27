import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";

/**
 * Persistent AI assistant chat history — one continuous conversation per user.
 * role: "user" | "model"
 * actions: any tool calls executed as part of this message (for audit / display), null for plain messages.
 */
export const aiMessagesTable = pgTable("ai_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // "user" | "model"
  content: text("content").notNull(),
  actions: jsonb("actions"), // ExecutedAction[] | null
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiMessageRow = typeof aiMessagesTable.$inferSelect;