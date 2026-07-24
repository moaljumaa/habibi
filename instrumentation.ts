// Next.js instrumentation hook — runs once at server startup. We use it to boot the cron
// scheduler in the Node.js runtime only (never Edge). See lib/scheduler.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();

    const { scheduleUpdateCheck } = await import("@/lib/update-check");
    scheduleUpdateCheck();
  }
}
