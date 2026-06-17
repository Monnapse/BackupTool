"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/components/api";
import { Modal, Spinner } from "@/components/ui";
import { DEST_LABELS } from "@/lib/format";
import type { DestinationKind } from "@/lib/types";

interface DestView {
  id: string;
  name: string;
  kind: DestinationKind;
  connected: boolean;
  path?: string;
}

export default function DestinationsPage() {
  return (
    <Suspense fallback={null}>
      <DestinationsInner />
    </Suspense>
  );
}

function DestinationsInner() {
  const params = useSearchParams();
  const [dests, setDests] = useState<DestView[]>([]);
  const [oauth, setOauth] = useState({ google: false, dropbox: false });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  async function load() {
    const [d, s] = await Promise.all([api("/api/destinations"), api("/api/status")]);
    setDests(d.destinations);
    setOauth(s.oauth);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setNotice({ kind: "ok", text: `Connected ${connected} successfully.` });
    if (error) setNotice({ kind: "err", text: `Connection failed: ${error}` });
  }, [params]);

  async function remove(id: string) {
    if (!confirm("Delete this destination? Backup jobs using it will break.")) return;
    await api(`/api/destinations/${id}`, { method: "DELETE" });
    load();
  }

  async function test(id: string) {
    setTesting(id);
    setNotice(null);
    try {
      await api(`/api/destinations/${id}/test`, { method: "POST" });
      setNotice({ kind: "ok", text: "Connection OK — destination is writable." });
    } catch (e: any) {
      setNotice({ kind: "err", text: e.message });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Destinations</h1>
          <p className="mt-1 text-sm text-muted">Where your backups are stored.</p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          + Add destination
        </button>
      </div>

      {notice && (
        <div
          className={`card p-3 text-sm ${
            notice.kind === "ok" ? "border-success/40 bg-success/10 text-green-200" : "border-danger/40 bg-danger/10 text-red-200"
          }`}
        >
          {notice.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted"><Spinner /> Loading…</div>
      ) : dests.length === 0 ? (
        <div className="card py-12 text-center text-sm text-muted">
          No destinations yet. Add a local drive or connect a cloud account.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {dests.map((d) => (
            <div key={d.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{d.name}</p>
                  <p className="text-xs text-muted">{DEST_LABELS[d.kind]}</p>
                </div>
                {d.kind === "local" ? (
                  <span className="badge bg-success/15 text-green-300">ready</span>
                ) : d.connected ? (
                  <span className="badge bg-success/15 text-green-300">connected</span>
                ) : (
                  <span className="badge bg-warn/15 text-amber-300">not connected</span>
                )}
              </div>

              {d.kind === "local" && (
                <p className="mt-3 truncate font-mono text-xs text-muted">{d.path}</p>
              )}

              <div className="mt-4 flex gap-2">
                {d.kind !== "local" && (
                  <a
                    className="btn-ghost text-xs"
                    href={`/api/destinations/oauth/${d.kind === "gdrive" ? "google" : "dropbox"}?destId=${d.id}`}
                  >
                    {d.connected ? "Reconnect" : "Connect"}
                  </a>
                )}
                <button className="btn-ghost text-xs" onClick={() => test(d.id)} disabled={testing === d.id}>
                  {testing === d.id ? <Spinner /> : "Test"}
                </button>
                <button className="btn-danger ml-auto text-xs" onClick={() => remove(d.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddDestination open={open} oauth={oauth} onClose={() => setOpen(false)} onSaved={load} />
    </div>
  );
}

function AddDestination({
  open,
  oauth,
  onClose,
  onSaved,
}: {
  open: boolean;
  oauth: { google: boolean; dropbox: boolean };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<DestinationKind>("local");
  const [name, setName] = useState("");
  const [path, setPath] = useState("/backups");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api("/api/destinations", {
        method: "POST",
        body: JSON.stringify({ name, kind, path: kind === "local" ? path : undefined }),
      });
      onSaved();
      onClose();
      setName("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const cloudDisabled =
    (kind === "gdrive" && !oauth.google) || (kind === "dropbox" && !oauth.dropbox);

  return (
    <Modal open={open} onClose={onClose} title="Add destination">
      <div className="space-y-4">
        <div>
          <label className="label">Type</label>
          <div className="grid grid-cols-3 gap-2">
            {(["local", "gdrive", "dropbox"] as DestinationKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  kind === k ? "border-accent bg-accent/10 text-indigo-200" : "border-border bg-surface-2 text-muted"
                }`}
              >
                {DEST_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. SD Card" />
        </div>

        {kind === "local" && (
          <div>
            <label className="label">Path (inside the container)</label>
            <input className="input font-mono" value={path} onChange={(e) => setPath(e.target.value)} />
            <p className="mt-1.5 text-xs text-muted">
              Mount your SD card / USB drive to this path in docker-compose.
            </p>
          </div>
        )}

        {kind !== "local" && (
          <p className="rounded-lg bg-surface-2 p-3 text-xs text-muted">
            {cloudDisabled
              ? `${DEST_LABELS[kind]} OAuth isn't configured. Set the client ID/secret in your .env first.`
              : "After creating, click “Connect” on the card to authorize access."}
          </p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || !name || cloudDisabled}>
            {saving ? <Spinner /> : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
