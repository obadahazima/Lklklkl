import { db } from "@workspace/db";
import { transactionsTable, clientsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// Default is a month, not a week — a client owing money for a few days isn't "overdue" for a
// small business that invoices/settles monthly; a month with no movement is a much more useful
// signal to actually act on.
export const DEFAULT_OVERDUE_DAYS = 30;

export type OverdueClient = {
  clientId: number;
  clientName: string;
  phone: string | null;
  daysOverdue: number;
  amounts: Record<string, number>;
};

/**
 * Clients the business owes money to — pending payment/expense transactions (money going OUT
 * that hasn't actually been paid out yet) where the oldest such pending transaction is at least
 * `minDays` old. This matches the app's own balance-color convention: a client's balance shows
 * red when received - paid < 0, i.e. the business owes them. Deliberately excludes pending
 * income/receipt transactions (money the client owes the business) — that's the client being
 * late, not the business, so it's a different concern. Shared by the AI's get_overdue_clients
 * tool and the dashboard's proactive check so both use one calculation.
 */
export async function getOverdueClients(userId: string, minDays: number = DEFAULT_OVERDUE_DAYS): Promise<OverdueClient[]> {
  const today = new Date();
  const [pending, clients] = await Promise.all([
    db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.userId, userId), eq(transactionsTable.status, "pending"))),
    db.select().from(clientsTable).where(eq(clientsTable.userId, userId)),
  ]);
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const byClient = new Map<number, { amounts: Map<string, number>; oldestDate: string }>();
  for (const t of pending) {
    if (!t.clientId) continue;
    // Only money the business still owes the client — not money the client owes the business.
    if (t.type !== "payment" && t.type !== "expense") continue;
    const entry = byClient.get(t.clientId) ?? { amounts: new Map<string, number>(), oldestDate: t.date };
    entry.amounts.set(t.currency, (entry.amounts.get(t.currency) ?? 0) + Number(t.amount));
    if (t.date < entry.oldestDate) entry.oldestDate = t.date;
    byClient.set(t.clientId, entry);
  }

  return [...byClient.entries()]
    .map(([clientId, entry]) => {
      const client = clientMap.get(clientId);
      if (!client) return null;
      const days = Math.floor((today.getTime() - new Date(entry.oldestDate).getTime()) / 86_400_000);
      return {
        clientId,
        clientName: client.name,
        phone: client.phone,
        daysOverdue: days,
        amounts: Object.fromEntries(entry.amounts),
      };
    })
    .filter((c): c is OverdueClient => c !== null && c.daysOverdue >= minDays)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
