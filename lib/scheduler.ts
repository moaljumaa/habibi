// lib/scheduler.ts — the daily run loop. Started once from instrumentation.ts (Node runtime).
// CRON_SCHEDULE controls cadence (default 06:00 daily). Empty/unset = no schedule (manual only).
import cron from "node-cron";
import { runAll, isRunning } from "./runner";

let _started = false;

export function startScheduler(): void {
  if (_started) return;
  const expr = process.env.CRON_SCHEDULE?.trim();
  if (!expr) {
    console.log("[scheduler] CRON_SCHEDULE unset — manual runs only");
    _started = true;
    return;
  }
  if (!cron.validate(expr)) {
    console.warn(`[scheduler] invalid CRON_SCHEDULE "${expr}" — skipping`);
    _started = true;
    return;
  }
  cron.schedule(expr, async () => {
    if (isRunning()) return;
    console.log("[scheduler] starting scheduled run");
    try {
      const s = await runAll();
      console.log(`[scheduler] done: ${s.runs} runs, ${s.errors} errors, $${s.costUsd.toFixed(3)}`);
    } catch (err) {
      console.error("[scheduler] run failed:", err);
    }
  });
  console.log(`[scheduler] scheduled: ${expr}`);
  _started = true;
}
