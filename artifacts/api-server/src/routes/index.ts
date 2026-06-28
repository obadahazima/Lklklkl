import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import tripsRouter from "./trips";
import studiosRouter from "./studios";
import transactionsRouter from "./transactions";
import dashboardRouter from "./dashboard";
import aiRouter from "./ai";
import backupRouter from "./backup";
import restoreRouter from "./restore";
import settingsRouter from "./settings";
import exchangeRatesRouter from "./exchange-rates.js";
const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(clientsRouter);
router.use(tripsRouter);
router.use(studiosRouter);
router.use(transactionsRouter);
router.use(dashboardRouter);
router.use(aiRouter);
router.use(backupRouter);
router.use(restoreRouter);
router.use(exchangeRatesRouter);

export default router;
