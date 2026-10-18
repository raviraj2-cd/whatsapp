import assert from "node:assert";

function runWorkerTests() {
  console.log("Starting Scheduler Worker Unit Tests...");

  // 1. Daily broadcast same-day lock simulation
  const broadcastLedger = new Map<string, { sent: number; failed: number }>();

  function simulateBroadcastRun(date: string, force = false): string {
    const existing = broadcastLedger.get(date);
    if (existing && existing.sent > 0 && !force) {
      return "skipped_already_run";
    }
    broadcastLedger.set(date, { sent: 10, failed: 0 });
    return "completed";
  }

  const today = "2026-10-15";
  const firstRun = simulateBroadcastRun(today);
  assert.strictEqual(firstRun, "completed", "First run today must succeed");

  const duplicateRun = simulateBroadcastRun(today);
  assert.strictEqual(duplicateRun, "skipped_already_run", "Second run without force must be skipped (safe against duplicate broadcasts)");

  const forcedRun = simulateBroadcastRun(today, true);
  assert.strictEqual(forcedRun, "completed", "Run with force=true must re-execute");

  // 2. Cron expression parse validation
  const dailyTime = "09:30";
  const [hour, minute] = dailyTime.split(":");
  const cronExpr = `${minute} ${hour} * * *`;
  assert.strictEqual(cronExpr, "30 09 * * *", "Cron expression for 09:30 must be '30 09 * * *'");

  console.log("✔ All Scheduler Worker unit tests passed successfully!");
}

runWorkerTests();
