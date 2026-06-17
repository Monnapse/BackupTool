// Pure formatting helpers safe to use on client and server.

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

export function relativeTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  const diff = Date.now() - ms;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [60_000, "s"],
    [3_600_000, "m"],
    [86_400_000, "h"],
    [Infinity, "d"],
  ];
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return `${Math.floor(abs / 60_000)}m ago`;
  if (abs < 86_400_000) return `${Math.floor(abs / 3_600_000)}h ago`;
  return `${Math.floor(abs / 86_400_000)}d ago`;
}

export function formatDateTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export function duration(start: number, end: number | null): string {
  if (!end) return "—";
  const s = Math.round((end - start) / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

// Friendly labels.
export const DB_LABELS: Record<string, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL / MariaDB",
  mongodb: "MongoDB",
  files: "Files / Volume",
};

export const DEST_LABELS: Record<string, string> = {
  local: "Local / Drive",
  gdrive: "Google Drive",
  dropbox: "Dropbox",
};

// Common cron presets for the schedule picker.
export const SCHEDULE_PRESETS: { label: string; value: string }[] = [
  { label: "Every 15 minutes", value: "*/15 * * * *" },
  { label: "Every 30 minutes", value: "*/30 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily at 2am", value: "0 2 * * *" },
  { label: "Weekly (Sun 3am)", value: "0 3 * * 0" },
];
