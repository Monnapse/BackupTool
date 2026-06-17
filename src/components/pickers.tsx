"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { Spinner } from "./ui";
import { formatBytes } from "@/lib/format";

interface Drive {
  path: string;
  label: string;
  type: "fixed" | "removable" | "mount";
  total: number | null;
  free: number | null;
}
interface Listing {
  path: string;
  parent: string | null;
  writable: boolean;
  dirs: { name: string; path: string }[];
}

const DRIVE_ICON: Record<string, string> = {
  fixed: "M4 17h16M4 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M7 12h.01",
  removable: "M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm3 14h6",
  mount: "M3 7l9-4 9 4-9 4-9-4Zm0 5l9 4 9-4",
};

/** Browse the machine's drives/mounts and pick a folder (local destination). */
export function FolderBrowser({
  value,
  onChange,
}: {
  value: string;
  onChange: (path: string, writable: boolean) => void;
}) {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const d = await api("/api/fs/drives");
        setDrives(d.drives);
        if (value) await open(value);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(path: string) {
    setError("");
    try {
      const l: Listing = await api(`/api/fs/list?path=${encodeURIComponent(path)}`);
      setListing(l);
      onChange(l.path, l.writable);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function createFolder() {
    if (!listing || !newFolder.trim()) return;
    setAdding(true);
    try {
      const r = await api("/api/fs/list", {
        method: "POST",
        body: JSON.stringify({ parent: listing.path, name: newFolder.trim() }),
      });
      setNewFolder("");
      await open(r.path);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Scanning drives…</div>;

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Drives & mounts</label>
        <div className="flex flex-wrap gap-2">
          {drives.map((d) => {
            const active = listing?.path === d.path || (!listing && value === d.path);
            return (
              <button
                key={d.path}
                type="button"
                onClick={() => open(d.path)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${
                  active ? "border-accent bg-accent/10 text-indigo-200" : "border-border bg-surface-2 text-gray-200"
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d={DRIVE_ICON[d.type]} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  <span className="block font-medium">{d.label}</span>
                  {d.free != null && (
                    <span className="text-muted">{formatBytes(d.free)} free</span>
                  )}
                </span>
              </button>
            );
          })}
          {drives.length === 0 && <p className="text-xs text-muted">No drives detected.</p>}
        </div>
      </div>

      {listing && (
        <div className="rounded-lg border border-border bg-surface-2">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <button
              type="button"
              disabled={!listing.parent}
              onClick={() => listing.parent && open(listing.parent)}
              className="btn-ghost px-2 py-1 text-xs disabled:opacity-40"
              title="Up one level"
            >
              ↑ Up
            </button>
            <span className="truncate font-mono text-xs text-muted">{listing.path}</span>
          </div>

          <div className="max-h-44 overflow-auto p-1">
            {listing.dirs.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted">No subfolders here.</p>
            ) : (
              listing.dirs.map((dir) => (
                <button
                  key={dir.path}
                  type="button"
                  onClick={() => open(dir.path)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-border"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-amber-300/80">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                  {dir.name}
                </button>
              ))
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border px-3 py-2">
            <input
              className="input py-1 text-xs"
              placeholder="New folder name…"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
            />
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={createFolder} disabled={adding || !newFolder.trim()}>
              {adding ? <Spinner /> : "Create"}
            </button>
          </div>
        </div>
      )}

      {listing && !listing.writable && (
        <p className="text-xs text-amber-300">⚠ This folder isn't writable by the app.</p>
      )}
      {listing && (
        <p className="text-xs text-muted">
          Backups will be saved to <span className="font-mono text-gray-300">{listing.path}</span>
        </p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

/** Pick a folder from a connected cloud account (gdrive/dropbox). */
export function CloudFolderPicker({
  destId,
  kind,
  onPick,
}: {
  destId: string;
  kind: "gdrive" | "dropbox";
  onPick: (folder: { id: string; name: string }) => void;
}) {
  const [stack, setStack] = useState<{ id: string; name: string }[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const current = stack[stack.length - 1] || { id: "", name: kind === "dropbox" ? "Dropbox" : "My Drive" };

  async function load(parent: string) {
    setLoading(true);
    setError("");
    try {
      const r = await api(`/api/destinations/${destId}/folders?parent=${encodeURIComponent(parent)}`);
      setFolders(r.folders);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enter(f: { id: string; name: string }) {
    setStack((s) => [...s, f]);
    load(f.id);
  }
  function up() {
    const ns = stack.slice(0, -1);
    setStack(ns);
    load(ns[ns.length - 1]?.id || "");
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button type="button" disabled={stack.length === 0} onClick={up} className="btn-ghost px-2 py-1 text-xs disabled:opacity-40">
          ↑ Up
        </button>
        <span className="truncate text-xs text-muted">{current.name}</span>
      </div>
      <div className="max-h-44 overflow-auto p-1">
        {loading ? (
          <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted"><Spinner /> Loading…</p>
        ) : folders.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted">No subfolders here.</p>
        ) : (
          folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => enter(f)}
              className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-border"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-amber-300/80">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              {f.name}
            </button>
          ))
        )}
      </div>
      <div className="border-t border-border px-3 py-2">
        <button
          type="button"
          className="btn-primary w-full py-1.5 text-xs"
          onClick={() => onPick(current)}
        >
          Save backups to “{current.name}”
        </button>
      </div>
      {error && <p className="px-3 pb-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
