import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientsRouter from "./clients";
import tripsRouter from "./trips";
import studiosRouter from "./studios";
import transactionsRouter from "./transactions";
import dashboardRouter from "./dashboard";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientsRouter);
router.use(tripsRouter);
router.use(studiosRouter);
router.use(transactionsRouter);
router.use(dashboardRouter);
router.use(aiRouter);

export default router;
