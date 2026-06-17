"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/components/api";
import { Spinner, StatusBadge } from "@/components/ui";
import { DB_LABELS, formatBytes, relativeTime } from "@/lib/format";
import type { BackupRun, BackupTarget, Destination } from "@/lib/types";

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [targets, setTargets] = useState<BackupTarget[]>([]);
  const [dests, setDests] = useState<Destination[]>([]);
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [docker, setDocker] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, d, r, s] = await Promise.all([
          api("/api/targets"),
          api("/api/destinations"),
          api("/api/runs"),
          api("/api/status"),
        ]);
        setTargets(t.targets);
        setDests(d.destinations);
        setRuns(r.runs);
        setDocker(s.docker);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted">
        <Spinner /> Loading…
      </div>
    );
  }

  const lastSuccess = runs.find((r) => r.status === "success");
  const failing = targets.filter((t) =>
    runs.find((r) => r.targetId === t.id)?.status === "failed"
  ).length;

  const stats = [
    { label: "Backup jobs", value: targets.length, href: "/targets" },
    { label: "Destinations", value: dests.length, href: "/destinations" },
    {
      label: "Last successful backup",
      value: lastSuccess ? relativeTime(lastSuccess.startedAt) : "Never",
      href: "/history",
    },
    { label: "Jobs last failing", value: failing, href: "/history", danger: failing > 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-muted">Your backup jobs at a glance.</p>
      </div>

      {docker && !docker.ok && (
        <div className="card border-danger/40 bg-danger/10 p-4 text-sm text-red-200">
          <p className="font-medium">Can't reach the Docker daemon</p>
          <p className="mt-1 text-red-300/80">{docker.error}</p>
          <p className="mt-2 text-red-300/70">
            Make sure the Docker socket is mounted into this container (see the README).
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card p-4 transition-colors hover:border-accent/40">
            <p className="text-xs uppercase tracking-wide text-muted">{s.label}</p>
            <p className={`mt-2 text-2xl font-semibold ${s.danger ? "text-red-400" : ""}`}>{s.value}</p>
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="font-semibold">Recent backups</h2>
          <Link href="/history" className="text-sm text-indigo-300 hover:underline">
            View all
          </Link>
        </div>
        {runs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">No backups have run yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {runs.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.targetName}</p>
                  <p className="text-xs text-muted">
                    {relativeTime(r.startedAt)} · {r.trigger}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted">{formatBytes(r.size)}</span>
                  <StatusBadge status={r.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
