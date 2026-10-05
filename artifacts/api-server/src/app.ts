import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware.js";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Railway sits behind a proxy; needed so rate limiting sees the real client IP.
app.set("trust proxy", 1);
app.use(helmet());

const generalLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false });
// AI endpoints cost real money (Gemini) — keep them much tighter.
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
// Support chat: cheap but public-facing, keep it modest.
const supportLimiter = rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
// Account deletion: very few attempts needed.
const deleteLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Comma-separated list of allowed browser origins for the web app, e.g.
// "https://myapp.example.com,https://staging.example.com". Falls back to
// common local dev ports when unset so `pnpm dev` keeps working out of the box.
// IMPORTANT: set ALLOWED_ORIGINS in production — reflecting any origin (the
// previous `origin: true` behavior) combined with `credentials: true` lets any
// website make authenticated requests to this API using a visitor's cookies.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Allow non-browser clients (mobile app, curl, server-to-server) which send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
  }),
);
// This API only ever receives small JSON payloads (transactions, settings, etc.) — file uploads
// like /restore go through multer with their own limit. A generous 25mb JSON limit here just
// increases exposure to memory-pressure DoS from large bodies with no corresponding legitimate use.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", generalLimiter);
app.use("/api/ai", aiLimiter);
app.use("/api/support", supportLimiter);
app.use("/api/me", deleteLimiter);
app.use("/api", router);

export default app;
