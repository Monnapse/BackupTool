"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/components/api";
import { Modal, Spinner } from "@/components/ui";
import { FolderBrowser, CloudFolderPicker } from "@/components/pickers";
import { DEST_LABELS } from "@/lib/format";
import type { DestinationKind } from "@/lib/types";

interface DestView {
  id: string;
  name: string;
  kind: DestinationKind;
  connected: boolean;
  hasCreds: boolean;
  folder?: string;
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
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [folderFor, setFolderFor] = useState<DestView | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  async function load() {
    const d = await api("/api/destinations");
    setDests(d.destinations);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) setNotice({ kind: "ok", text: `Connected ${connected}. Now choose a folder for backups.` });
    if (error) setNotice({ kind: "err", text: `Connection failed: ${decodeURIComponent(error)}` });
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
      setNotice({ kind: "ok", text: "Connection OK — destination is reachable." });
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
        <button className="btn-primary" onClick={() => setAdding(true)}>
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
          No destinations yet. Add a local drive or link a cloud account.
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
                  <span className="badge bg-warn/15 text-amber-300">link account</span>
                )}
              </div>

              {d.kind === "local" ? (
                <p className="mt-3 truncate font-mono text-xs text-muted">{d.path}</p>
              ) : (
                <p className="mt-3 truncate text-xs text-muted">
                  Folder: <span className="text-gray-300">{d.folder || "(not set — defaults to /BackupTool)"}</span>
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {d.kind !== "local" && (
                  <a
                    className="btn-ghost text-xs"
                    href={`/api/destinations/oauth/${d.kind === "gdrive" ? "google" : "dropbox"}?destId=${d.id}`}
                  >
                    {d.connected ? "Reconnect" : "Link account"}
                  </a>
                )}
                {d.kind !== "local" && d.connected && (
                  <button className="btn-ghost text-xs" onClick={() => setFolderFor(d)}>
                    Choose folder
                  </button>
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

      {adding && <AddDestination onClose={() => setAdding(false)} onSaved={load} />}
      {folderFor && (
        <FolderModal
          dest={folderFor}
          onClose={() => setFolderFor(null)}
          onSaved={() => {
            setFolderFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function FolderModal({
  dest,
  onClose,
  onSaved,
}: {
  dest: DestView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function pick(folder: { id: string; name: string }) {
    setSaving(true);
    setError("");
    try {
      const body =
        dest.kind === "gdrive"
          ? { rootFolderId: folder.id, rootFolderName: folder.name }
          : { basePath: folder.id || "/BackupTool" };
      await api(`/api/destinations/${dest.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Choose folder — ${dest.name}`}>
      {saving ? (
        <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Saving…</div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Browse your {DEST_LABELS[dest.kind]} and pick where backups should go. Each
            job gets its own subfolder inside it.
          </p>
          <CloudFolderPicker destId={dest.id} kind={dest.kind as "gdrive" | "dropbox"} onPick={pick} />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </>
      )}
    </Modal>
  );
}

function AddDestination({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<DestinationKind>("local");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const redirectUri =
    kind === "gdrive"
      ? `${origin}/api/destinations/oauth/google/callback`
      : `${origin}/api/destinations/oauth/dropbox/callback`;

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body: any = { name, kind };
      if (kind === "local") body.path = path;
      else {
        body.clientId = clientId.trim();
        body.clientSecret = clientSecret.trim();
      }
      await api("/api/destinations", { method: "POST", body: JSON.stringify(body) });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const valid =
    !!name && (kind === "local" ? !!path : !!clientId.trim() && !!clientSecret.trim());

  return (
    <Modal open onClose={onClose} title="Add destination" wide>
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
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "local" ? "e.g. SD Card" : "e.g. My Google Drive"} />
        </div>

        {kind === "local" ? (
          <FolderBrowser value={path} onChange={(p) => setPath(p)} />
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted">
              <p className="mb-2 font-medium text-gray-200">One-time setup</p>
              <p>
                Create an OAuth app in the{" "}
                {kind === "gdrive" ? "Google Cloud Console" : "Dropbox App Console"} and paste
                its credentials below. Add this exact redirect URI to the app:
              </p>
              <code className="mt-2 block break-all rounded bg-bg px-2 py-1 text-[11px] text-indigo-200">
                {redirectUri}
              </code>
              {kind === "dropbox" && (
                <p className="mt-2">Enable the <span className="text-gray-300">files.content.write</span> and <span className="text-gray-300">files.content.read</span> scopes.</p>
              )}
            </div>
            <div>
              <label className="label">{kind === "gdrive" ? "Client ID" : "App key"}</label>
              <input className="input font-mono" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
            <div>
              <label className="label">{kind === "gdrive" ? "Client Secret" : "App secret"}</label>
              <input className="input font-mono" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
            </div>
            <p className="text-xs text-muted">After saving, click <span className="text-gray-300">Link account</span> on the card to sign in, then choose a folder.</p>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving || !valid}>
            {saving ? <Spinner /> : "Create"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
