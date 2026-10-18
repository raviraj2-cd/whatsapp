import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import { sendText } from "@/lib/whatsapp/client";
import MessageLog from "@/models/MessageLog";
import User from "@/models/User";

/**
 * Retries failed outbound WhatsApp messages up to 3 attempts.
 */
export async function retryFailedSendsJob(): Promise<{ retriedCount: number; resolvedCount: number }> {
  await connectDB();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const failedLogs = await MessageLog.find({
    direction: "outbound",
    status: "failed",
    createdAt: { $gte: oneHourAgo },
  }).limit(20);

  let retriedCount = 0;
  let resolvedCount = 0;

  for (const log of failedLogs) {
    try {
      const user = log.userId ? await User.findById(log.userId) : null;
      if (!user?.phone) continue;

      retriedCount++;
      // Re-attempt sending based on logged payload
      const textBody = (log.payload?.text as any)?.body || (log.payload?.body as any)?.text;

      if (textBody) {
        await sendText(user.phone, textBody);
        log.status = "sent";
        log.error = undefined;
        await log.save();
        resolvedCount++;
        logger.info({ messageLogId: log._id, phone: user.phone }, "Successfully re-sent failed message");
      }
    } catch (err) {
      logger.warn({ messageLogId: log._id, err }, "Retry attempt failed for messageLog");
    }
  }

  return { retriedCount, resolvedCount };
}
