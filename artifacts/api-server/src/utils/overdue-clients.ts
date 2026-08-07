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
 * Clients with pending (unsettled) transactions whose oldest pending transaction is at least
 * `minDays` old. Shared by the AI's get_overdue_clients tool and the dashboard's proactive
 * overdue-clients check so both use one calculation.
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
