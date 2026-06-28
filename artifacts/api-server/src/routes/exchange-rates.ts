import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

router.get("/exchange-rates", requireAuth, async (req, res) => {
  try {
    const base = (req.query.base as string) || "AED";
    const response = await fetch(
      `https://api.exchangerate-api.com/v4/latest/${base}`
    );
    if (!response.ok) {
      res.status(502).json({ error: "Failed to fetch exchange rates" });
      return;
    }
    const data = await response.json() as { rates: Record<string, number> };
    res.json({ ...data.rates, [base]: 1 });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
