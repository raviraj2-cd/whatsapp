import { BotMessages } from "@/lib/bot/messages";
import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { sendButtons, sendTemplate } from "@/lib/whatsapp/client";
import Broadcast from "@/models/Broadcast";
import Session from "@/models/Session";
import Settings from "@/models/Settings";
import User, { IUser } from "@/models/User";

export interface BroadcastResult {
  date: string;
  totalSubscribers: number;
  sentCount: number;
  failedCount: number;
  status: "completed" | "skipped_already_run" | "zero_subscribers";
}

/**
 * Executes the daily "Need food?" broadcast to all opted-in customers.
 * Enforces idempotency per day, in-process rate limiting, and failure retries.
 */
export async function runDailyBroadcastJob(force = false): Promise<BroadcastResult> {
  await connectDB();

  // Get current date in IST (Asia/Kolkata)
  const istDateString = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  logger.info({ date: istDateString, force }, "Starting daily broadcast execution");

  // 1. Idempotency Guard: Check if broadcast already completed today
  let broadcastDoc = await Broadcast.findOne({ date: istDateString });

  if (broadcastDoc && broadcastDoc.sentCount > 0 && !force) {
    logger.warn({ date: istDateString }, "Daily broadcast already executed today. Skipping.");
    return {
      date: istDateString,
      totalSubscribers: 0,
      sentCount: broadcastDoc.sentCount,
      failedCount: broadcastDoc.failedCount,
      status: "skipped_already_run",
    };
  }

  if (!broadcastDoc) {
    broadcastDoc = await Broadcast.create({
      date: istDateString,
      sentCount: 0,
      failedCount: 0,
      yesCount: 0,
      noCount: 0,
      noReplyCount: 0,
    });
  }

  // 2. Query all active, opted-in subscribers
  const eligibleUsers: IUser[] = await User.find({
    optIn: true,
    blocked: false,
  });

  if (eligibleUsers.length === 0) {
    logger.error({ date: istDateString }, "🚨 ALERT: Zero eligible subscribers found for daily broadcast!");
    return {
      date: istDateString,
      totalSubscribers: 0,
      sentCount: 0,
      failedCount: 0,
      status: "zero_subscribers",
    };
  }

  const settings = await Settings.findOne({ key: "app_settings" }).lean();
  const sessionTimeoutMin = settings?.sessionTimeoutMin || 30;

  let sent = 0;
  let failed = 0;

  logger.info({ eligibleCount: eligibleUsers.length }, "Dispatching daily broadcast messages");

  for (const user of eligibleUsers) {
    let success = false;
    let attempts = 0;

    // Retry sending up to 3 times on transient failure
    while (!success && attempts < 3) {
      attempts++;
      try {
        // Send approved template if templateName is configured, otherwise fallback to interactive buttons
        const templateName = process.env.WHATSAPP_TEMPLATE_DAILY_ASK;

        if (templateName) {
          await sendTemplate(user.phone, templateName, "en");
        } else {
          await sendButtons(user.phone, BotMessages.dailyAskPrompt, BotMessages.dailyAskButtons);
        }

        success = true;
        sent++;

        // Update User Session to ASKED
        const expiresAt = new Date(Date.now() + sessionTimeoutMin * 60 * 1000);
        await Session.findOneAndUpdate(
          { userId: user._id },
          {
            step: "ASKED",
            tempData: { lastAskedAt: new Date().toISOString() },
            expiresAt,
          },
          { upsert: true }
        );
      } catch (err) {
        logger.warn({ attempt: attempts, phone: user.phone, err }, "Broadcast delivery attempt failed");
        if (attempts < 3) {
          await new Promise((r) => setTimeout(r, 200 * attempts)); // Backoff
        }
      }
    }

    if (!success) {
      failed++;
    }

    // Rate limiting: 50ms pause (~20 messages/sec, safe for Meta Tier 1 limits)
    await new Promise((r) => setTimeout(r, 50));
  }

  // Update Broadcast document stats
  broadcastDoc.sentCount = sent;
  broadcastDoc.failedCount = failed;
  await broadcastDoc.save();

  logger.info(
    { date: istDateString, sent, failed, total: eligibleUsers.length },
    "Daily broadcast execution completed"
  );

  return {
    date: istDateString,
    totalSubscribers: eligibleUsers.length,
    sentCount: sent,
    failedCount: failed,
    status: "completed",
  };
}
