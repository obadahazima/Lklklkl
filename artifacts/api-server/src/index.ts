import { ensureDebts } from "./lib/debts";
import { ensureOpeningBalanceDates } from "./lib/opening-balance";
import app from "./app";
import { ensureAccountCreditLimits } from "./lib/account-credit";
import { ensureTransactionReceipts } from "./lib/transaction-receipts";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

void ensureTransactionReceipts().then(ensureAccountCreditLimits).then(ensureDebts).then(ensureOpeningBalanceDates).then(() => {
  app.listen(port, (err) => {
    if (err) { logger.error({ err }, "Error listening on port"); process.exit(1); }
    logger.info({ port }, "Server listening");
  });
}).catch((err) => {
  logger.error({ err }, "Could not initialize financial storage");
  process.exit(1);
});
