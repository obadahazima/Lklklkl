import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getExchangeRates } from "../utils/exchange-rates.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/exchange-rates", async (req, res) => {
  try {
    const rates = await getExchangeRates();
    res.json(rates);
  } catch {
    res.status(500).json({ error: "Failed to fetch exchange rates" });
  }
});

export default router;
