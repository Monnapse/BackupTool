"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { Modal, Spinner, StatusBadge } from "@/components/ui";
import { duration, formatBytes, formatDateTime } from "@/lib/format";
import type { BackupRun } from "@/lib/types";

export default function HistoryPage() {
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BackupRun | null>(null);

  async function load() {
    const r = await api("/api/runs");
    setRuns(r.runs);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // live-ish refresh
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">History</h1>
        <p className="mt-1 text-sm text-muted">Every backup run, newest first.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted"><Spinner /> Loading…</div>
      ) : runs.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted">No runs yet.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Started</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Size</th>
                <th className="px-4 py-3 font-medium">Trigger</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3 font-medium">{r.targetName}</td>
                  <td className="px-4 py-3 text-muted">{formatDateTime(r.startedAt)}</td>
                  <td className="px-4 py-3 text-muted">{duration(r.startedAt, r.finishedAt)}</td>
                  <td className="px-4 py-3 text-muted">{formatBytes(r.size)}</td>
                  <td className="px-4 py-3 text-muted">{r.trigger}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-xs text-indigo-300 hover:underline" onClick={() => setSelected(r)}>
                      Log
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `${selected.targetName} — log` : ""} wide>
        {selected && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
              <span>Artifact: <span className="font-mono text-gray-300">{selected.artifact || "—"}</span></span>
              <span>Size: {formatBytes(selected.size)}</span>
              <span>Status: {selected.status}</span>
            </div>
            <pre className="max-h-[50vh] overflow-auto rounded-lg bg-bg p-4 font-mono text-xs leading-relaxed text-gray-300">
              {selected.log || "(no log)"}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
