import connectDB from "@/lib/db";
import logger from "@/lib/logger";
import Session from "@/models/Session";

/**
 * Resets inactive or expired customer sessions back to IDLE.
 */
export async function expireSessionsJob(): Promise<{ resetCount: number }> {
  await connectDB();
  const now = new Date();

  const result = await Session.updateMany(
    {
      step: { $ne: "IDLE" },
      expiresAt: { $lt: now },
    },
    {
      $set: {
        step: "IDLE",
        tempData: {},
      },
    }
  );

  const resetCount = result.modifiedCount || 0;
  if (resetCount > 0) {
    logger.info({ resetCount }, "Reset expired sessions to IDLE");
  }

  return { resetCount };
}
