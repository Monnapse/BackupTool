"use client";

import { useEffect, useState } from "react";
import { api } from "@/components/api";
import { EmptyState, Modal, Spinner, StatusBadge } from "@/components/ui";
import { DB_LABELS, DEST_LABELS, relativeTime, SCHEDULE_PRESETS } from "@/lib/format";
import type { BackupRun, BackupTarget, ContainerInfo, DbKind } from "@/lib/types";

interface DestView { id: string; name: string; kind: string; connected: boolean }

export default function TargetsPage() {
  const [targets, setTargets] = useState<BackupTarget[]>([]);
  const [dests, setDests] = useState<DestView[]>([]);
  const [runs, setRuns] = useState<Record<string, BackupRun>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BackupTarget | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [t, d, r] = await Promise.all([
      api("/api/targets"),
      api("/api/destinations"),
      api("/api/runs"),
    ]);
    setTargets(t.targets);
    setDests(d.destinations);
    // Keep the latest run per target for status display.
    const latest: Record<string, BackupRun> = {};
    for (const run of r.runs as BackupRun[]) if (!latest[run.targetId]) latest[run.targetId] = run;
    setRuns(latest);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function runNow(id: string) {
    setBusy(id);
    try {
      await api(`/api/targets/${id}/run`, { method: "POST" });
    } catch {
      /* surfaced via history */
    } finally {
      setBusy(null);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this backup job? Existing backup files are kept.")) return;
    await api(`/api/targets/${id}`, { method: "DELETE" });
    load();
  }

  async function toggle(t: BackupTarget) {
    await api(`/api/targets/${t.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...t, config: { ...t.config, password: "********" }, enabled: !t.enabled }),
    });
    load();
  }

  const destNames = (ids: string[]) =>
    ids.map((id) => dests.find((d) => d.id === id)?.name || "—").join(", ") || "—";
  const scheduleLabel = (cron: string) =>
    SCHEDULE_PRESETS.find((p) => p.value === cron)?.label || cron;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Backup Jobs</h1>
          <p className="mt-1 text-sm text-muted">Each job dumps one container on a schedule.</p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setCreating(true)}
          disabled={dests.length === 0}
          title={dests.length === 0 ? "Add a destination first" : ""}
        >
          + New job
        </button>
      </div>

      {dests.length === 0 && !loading && (
        <div className="card border-warn/40 bg-warn/10 p-3 text-sm text-amber-200">
          Add a <a href="/destinations" className="underline">destination</a> before creating a backup job.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted"><Spinner /> Loading…</div>
      ) : targets.length === 0 ? (
        <EmptyState
          title="No backup jobs yet"
          subtitle="Create one to start backing up a container's database."
          action={dests.length > 0 ? <button className="btn-primary" onClick={() => setCreating(true)}>+ New job</button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {targets.map((t) => {
            const run = runs[t.id];
            return (
              <div key={t.id} className="card flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{t.name}</p>
                    {!t.enabled && <span className="badge bg-border text-muted">paused</span>}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {DB_LABELS[t.dbKind]} · {t.containerName} → {destNames(t.destinationIds)}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {scheduleLabel(t.schedule)} · keep {t.keepCount} · {run ? `last ${relativeTime(run.startedAt)}` : "never run"}
                  </p>
                </div>

                {run && <StatusBadge status={run.status} />}

                <div className="flex items-center gap-2">
                  <button className="btn-ghost text-xs" onClick={() => runNow(t.id)} disabled={busy === t.id}>
                    {busy === t.id ? <Spinner /> : "Run now"}
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => toggle(t)}>
                    {t.enabled ? "Pause" : "Resume"}
                  </button>
                  <button className="btn-ghost text-xs" onClick={() => setEditing(t)}>Edit</button>
                  <button className="btn-danger text-xs" onClick={() => remove(t.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(creating || editing) && (
        <JobEditor
          target={editing}
          dests={dests}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

const DB_KINDS: DbKind[] = ["postgres", "mysql", "mongodb", "files"];

function JobEditor({
  target,
  dests,
  onClose,
  onSaved,
}: {
  target: BackupTarget | null;
  dests: DestView[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editingExisting = !!target;
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loadingC, setLoadingC] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(target?.name || "");
  const [containerId, setContainerId] = useState(target?.containerId || "");
  const [containerName, setContainerName] = useState(target?.containerName || "");
  const [dbKind, setDbKind] = useState<DbKind>(target?.dbKind || "postgres");
  const [destinationIds, setDestinationIds] = useState<string[]>(
    target?.destinationIds || (dests[0] ? [dests[0].id] : [])
  );
  const [schedule, setSchedule] = useState(target?.schedule || "0 * * * *");
  const [keepCount, setKeepCount] = useState(target?.keepCount ?? 2);
  const [cfg, setCfg] = useState<Record<string, any>>(
    target ? { ...target.config, password: target.config.password ? "********" : "" } : {}
  );
  const [pathsText, setPathsText] = useState((target?.config.paths || []).join("\n"));

  useEffect(() => {
    api("/api/containers")
      .then((d) => setContainers(d.containers))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingC(false));
  }, []);

  function pickContainer(id: string) {
    const c = containers.find((x) => x.id === id);
    setContainerId(id);
    if (!c) return;
    setContainerName(c.name);
    if (c.guessedKind) setDbKind(c.guessedKind);
    setCfg({ ...c.detected });
    if (!name) setName(`${c.name} backup`);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const config =
        dbKind === "files"
          ? { paths: pathsText.split("\n").map((s) => s.trim()).filter(Boolean) }
          : cfg;
      const body = {
        name,
        containerId,
        containerName,
        dbKind,
        config,
        destinationIds,
        schedule,
        keepCount: Number(keepCount),
        enabled: target?.enabled ?? true,
      };
      if (editingExisting) {
        await api(`/api/targets/${target!.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await api("/api/targets", { method: "POST", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (k: string, v: any) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <Modal open onClose={onClose} title={editingExisting ? "Edit backup job" : "New backup job"} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Container</label>
            {loadingC ? (
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading containers…</div>
            ) : (
              <select className="input" value={containerId} onChange={(e) => pickContainer(e.target.value)}>
                <option value="">Select a container…</option>
                {containers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.guessedKind ? `(${c.guessedKind})` : ""} — {c.state}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="label">Job name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production DB" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Database type</label>
            <select className="input" value={dbKind} onChange={(e) => setDbKind(e.target.value as DbKind)}>
              {DB_KINDS.map((k) => (
                <option key={k} value={k}>{DB_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Save to (pick one or more)</label>
            <div className="max-h-36 space-y-1 overflow-auto rounded-lg border border-border bg-surface-2 p-2">
              {dests.map((d) => (
                <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-border">
                  <input
                    type="checkbox"
                    className="accent-indigo-500"
                    checked={destinationIds.includes(d.id)}
                    onChange={(e) =>
                      setDestinationIds((ids) =>
                        e.target.checked ? [...ids, d.id] : ids.filter((x) => x !== d.id)
                      )
                    }
                  />
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted">{DEST_LABELS[d.kind] || d.kind}</span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              If a destination is offline (USB unplugged, cloud down), that copy is kept on this
              machine and synced automatically when it's back.
            </p>
          </div>
        </div>

        {/* Connection details per database type */}
        {dbKind === "files" ? (
          <div>
            <label className="label">Paths to archive (one per line, inside the container)</label>
            <textarea
              className="input font-mono"
              rows={3}
              value={pathsText}
              onChange={(e) => setPathsText(e.target.value)}
              placeholder={"/var/lib/redis\n/data"}
            />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">User</label>
              <input className="input" value={cfg.user || ""} onChange={(e) => set("user", e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                className="input"
                value={cfg.password || ""}
                onChange={(e) => set("password", e.target.value)}
                placeholder={editingExisting ? "unchanged" : ""}
              />
            </div>
            <div>
              <label className="label">Database <span className="text-muted/60">(blank = all)</span></label>
              <input className="input" value={cfg.database || ""} onChange={(e) => set("database", e.target.value)} />
            </div>
            {dbKind === "mongodb" && (
              <div>
                <label className="label">Auth DB</label>
                <input className="input" value={cfg.authDb || "admin"} onChange={(e) => set("authDb", e.target.value)} />
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Schedule</label>
            <select
              className="input"
              value={SCHEDULE_PRESETS.some((p) => p.value === schedule) ? schedule : "custom"}
              onChange={(e) => e.target.value !== "custom" && setSchedule(e.target.value)}
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
              <option value="custom">Custom (cron)…</option>
            </select>
            <input
              className="input mt-2 font-mono"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 * * * *"
            />
          </div>
          <div>
            <label className="label">Keep how many backups (rotation)</label>
            <input
              type="number"
              min={1}
              className="input"
              value={keepCount}
              onChange={(e) => setKeepCount(Number(e.target.value))}
            />
            <p className="mt-1.5 text-xs text-muted">
              Keeps the newest N files; older ones are deleted each run. e.g. 2 = two rotating slots.
            </p>
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={saving || !name || !containerId || destinationIds.length === 0}
          >
            {saving ? <Spinner /> : editingExisting ? "Save changes" : "Create job"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
