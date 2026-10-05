import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { TERMS_VERSION } from "../lib/legalVersion.js";

const router = Router();

/**
 * Records that the signed-in user accepted the current Terms + Privacy Policy.
 * Stored in Clerk publicMetadata (no DB table), so it follows the user across web and mobile.
 */
router.post("/consent", requireAuth, async (req, res): Promise<void> => {
  if (req.body?.version !== TERMS_VERSION) {
    res.status(400).json({ error: "Outdated or missing terms version", current: TERMS_VERSION });
    return;
  }
  try {
    await clerkClient.users.updateUserMetadata(req.userId, {
      publicMetadata: { consent: { version: TERMS_VERSION, acceptedAt: new Date().toISOString() } },
    });
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "Failed to record consent");
    res.status(500).json({ error: "Failed to record consent" });
  }
});

export default router;
