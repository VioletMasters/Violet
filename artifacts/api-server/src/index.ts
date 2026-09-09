import app from "./app";
import { logger } from "./lib/logger";
import { startAbandonedPaidSignupCleanup } from "./lib/abandonedPaidSignups";
import { bootstrapHostedSuperAdmin } from "./lib/hostedSuperAdminBootstrap";
import { backfillTenantLicenses } from "./lib/entitlements";

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

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
  startAbandonedPaidSignupCleanup();

  void bootstrapHostedSuperAdmin().catch((err) => {
    logger.error({ err }, "Hosted super-admin bootstrap failed");
  });
  void backfillTenantLicenses()
    .then((result) => logger.info(result, "Tenant license backfill completed"))
    .catch((err) => logger.error({ err }, "Tenant license backfill failed"));
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
