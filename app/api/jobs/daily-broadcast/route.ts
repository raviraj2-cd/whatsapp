import { NextRequest, NextResponse } from "next/server";
import logger from "@/lib/logger";
import { runDailyBroadcastJob } from "@/worker/jobs/daily-broadcast";

/**
 * Secured Manual Trigger for Daily WhatsApp Broadcast
 * Header: `x-cron-secret: <CRON_SECRET>` or `Authorization: Bearer <CRON_SECRET>`
 * Query / Body param: `force=true` to override same-day execution lock.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const secretHeader = request.headers.get("x-cron-secret");
    const cronSecret = process.env.CRON_SECRET;

    const providedSecret =
      secretHeader || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

    if (!cronSecret || providedSecret !== cronSecret) {
      logger.warn("Unauthorized attempt to trigger daily broadcast endpoint");
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let force = searchParams.get("force") === "true";

    try {
      const body = await request.json();
      if (body?.force === true) force = true;
    } catch {
      // Empty or non-JSON body is valid
    }

    const result = await runDailyBroadcastJob(force);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logger.error({ error }, "Error running manual daily broadcast endpoint");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
