import "dotenv/config";
import cron from "node-cron";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { expireUnpaidOrdersJob, reconcilePaymentsJob } from "@/lib/payments/jobs";
import Settings from "@/models/Settings";
import { runDailyBroadcastJob } from "./jobs/daily-broadcast";
import { expireSessionsJob } from "./jobs/expire-sessions";
import { retryFailedSendsJob } from "./jobs/retry-failed-sends";

/**
 * Long-running background worker process.
 */
export async function startWorker() {
  logger.info("Initializing FoodOps Background Scheduler Worker...");
  await connectDB();

  // Load daily broadcast schedule from settings (default: 09:00)
  const settings = await Settings.findOne({ key: "app_settings" }).lean();
  const dailySendTime = settings?.dailySendTime || "09:00";
  const [hour, minute] = dailySendTime.split(":");
  const broadcastCronExpr = `${minute} ${hour} * * *`;

  logger.info({ dailySendTime, broadcastCronExpr, timezone: "Asia/Kolkata" }, "Scheduling daily broadcast job");

  // 1. Daily Broadcast Job (at dailySendTime IST)
  cron.schedule(
    broadcastCronExpr,
    async () => {
      logger.info("Triggering scheduled daily broadcast");
      try {
        await runDailyBroadcastJob();
      } catch (err) {
        logger.error({ err }, "Scheduled daily broadcast failed");
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  // 2. Expire Payment Links Job (every 5 minutes)
  cron.schedule("*/5 * * * *", async () => {
    try {
      await expireUnpaidOrdersJob(15);
    } catch (err) {
      logger.error({ err }, "Error running expireUnpaidOrdersJob");
    }
  });

  // 3. Expire Inactive Customer Sessions (every 10 minutes)
  cron.schedule("*/10 * * * *", async () => {
    try {
      await expireSessionsJob();
    } catch (err) {
      logger.error({ err }, "Error running expireSessionsJob");
    }
  });

  // 4. Nightly Payment Reconciliation Job (1:00 AM IST)
  cron.schedule(
    "0 1 * * *",
    async () => {
      logger.info("Triggering nightly payment reconciliation");
      try {
        await reconcilePaymentsJob();
      } catch (err) {
        logger.error({ err }, "Error running reconcilePaymentsJob");
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  // 5. Retry Failed Outbound Sends (every 5 minutes)
  cron.schedule("*/5 * * * *", async () => {
    try {
      await retryFailedSendsJob();
    } catch (err) {
      logger.error({ err }, "Error running retryFailedSendsJob");
    }
  });

  logger.info("✔ All 5 background worker cron jobs are active and scheduled!");
}

// Graceful shutdown handling
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down worker gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down worker gracefully...");
  process.exit(0);
});

startWorker().catch((err) => {
  logger.error({ err }, "Worker crashed on initialization");
  process.exit(1);
});
