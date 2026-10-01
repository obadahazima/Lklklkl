import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { db } from "@workspace/db";
import {
  transactionsTable,
  clientsTable,
  tripsTable,
  accountsTable,
  aiMessagesTable,
  userSettingsTable,
  subscriptionsTable,
  aiUsageTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

/**
 * Permanently deletes the signed-in user's account: every row they own in our database,
 * then the Clerk user itself. Required by Google Play's account-deletion policy.
 * The client must send { "confirm": "DELETE" } so a stray request can't wipe an account.
 */
router.delete("/me", requireAuth, async (req, res): Promise<void> => {
  if (req.body?.confirm !== "DELETE") {
    res.status(400).json({ error: 'Send { "confirm": "DELETE" } to confirm account deletion' });
    return;
  }
  const uid = req.userId;
  try {
    await db.transaction(async (tx) => {
      await tx.delete(transactionsTable).where(eq(transactionsTable.userId, uid));
      await tx.delete(clientsTable).where(eq(clientsTable.userId, uid));
      await tx.delete(tripsTable).where(eq(tripsTable.userId, uid));
      await tx.delete(accountsTable).where(eq(accountsTable.userId, uid));
      await tx.delete(aiMessagesTable).where(eq(aiMessagesTable.userId, uid));
      await tx.delete(userSettingsTable).where(eq(userSettingsTable.userId, uid));
      await tx.delete(subscriptionsTable).where(eq(subscriptionsTable.userId, uid));
      await tx.delete(aiUsageTable).where(eq(aiUsageTable.userId, uid));
    });
    await clerkClient.users.deleteUser(uid);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to delete user account");
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
