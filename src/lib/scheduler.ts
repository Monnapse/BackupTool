import cron, { ScheduledTask } from "node-cron";
import { listTargets } from "./repo";
import { runBackup } from "./backup/engine";

// In-process cron scheduler. Started once from instrumentation.ts on server
// boot, and re-synced whenever targets change (create/update/delete).

const tasks = new Map<string, ScheduledTask>();
const running = new Set<string>();
let started = false;

function scheduleTarget(id: string, expr: string) {
  if (!cron.validate(expr)) {
    console.warn(`[scheduler] invalid cron "${expr}" for target ${id}; skipping`);
    return;
  }
  const task = cron.schedule(expr, () => trigger(id));
  tasks.set(id, task);
}

async function trigger(id: string) {
  if (running.has(id)) {
    console.warn(`[scheduler] target ${id} still running; skipping this tick`);
    return;
  }
  running.add(id);
  try {
    const outcome = await runBackup(id, "schedule");
    console.log(`[scheduler] target ${id} → ${outcome.ok ? "success" : "failed"}`);
  } catch (e) {
    console.error(`[scheduler] target ${id} threw`, e);
  } finally {
    running.delete(id);
  }
}

/** Rebuild all cron tasks from the database. Safe to call repeatedly. */
export function reloadSchedules() {
  for (const t of tasks.values()) t.stop();
  tasks.clear();

  const targets = listTargets();
  let count = 0;
  for (const t of targets) {
    if (!t.enabled) continue;
    scheduleTarget(t.id, t.schedule);
    count++;
  }
  console.log(`[scheduler] loaded ${count} scheduled target(s)`);
}

/** Called once at server startup. */
export function startScheduler() {
  if (started) return;
  started = true;
  reloadSchedules();
}

export function isRunning(id: string): boolean {
  return running.has(id);
}
