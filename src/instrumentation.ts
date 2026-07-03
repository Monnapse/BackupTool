// Next.js runs this once when the Node.js server boots (instrumentationHook).
// We use it to start the backup scheduler so cron jobs run inside the app.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
    const { startSpoolWorker } = await import("./lib/backup/spool");
    startSpoolWorker();
    const { startAutomount } = await import("./lib/automount");
    startAutomount();
  }
}
