import { Dropbox } from "dropbox";
import { Readable } from "node:stream";
import type { Destination } from "../types";
import type { StoredArtifact } from "./index";

// Dropbox destination.
// config: { clientId, clientSecret, refresh_token, basePath? }
// App key/secret are entered per-destination in the UI (falling back to
// DROPBOX_CLIENT_ID/SECRET env). The SDK refreshes the short-lived access token
// automatically using the refresh token.

function dbx(dest: Destination): Dropbox {
  const refresh = dest.config.refresh_token as string;
  if (!refresh) throw new Error("Dropbox destination is not connected.");
  return new Dropbox({
    clientId: (dest.config.clientId as string) || process.env.DROPBOX_CLIENT_ID,
    clientSecret: (dest.config.clientSecret as string) || process.env.DROPBOX_CLIENT_SECRET,
    refreshToken: refresh,
  });
}

/** Base folder chosen by the user (default /BackupTool). */
function root(dest: Destination): string {
  const p = ((dest.config.basePath as string) || "/BackupTool").replace(/\/+$/, "");
  return p.startsWith("/") ? p : `/${p}`;
}

function folderPath(dest: Destination, targetId: string): string {
  return `${root(dest)}/${targetId}`;
}

/** List subfolders under a path for the folder picker ("" => account root). */
export async function listFolders(
  dest: Destination,
  path = ""
): Promise<{ path: string; name: string }[]> {
  const client = dbx(dest);
  const res = await client.filesListFolder({ path: path || "" });
  return res.result.entries
    .filter((e) => e[".tag"] === "folder")
    .map((e: any) => ({ path: e.path_lower, name: e.name }));
}

export async function upload(
  dest: Destination,
  targetId: string,
  filename: string,
  data: Readable
): Promise<{ ref: string; size: number }> {
  const client = dbx(dest);
  const path = `${folderPath(dest, targetId)}/${filename}`;
  const CHUNK = 8 * 1024 * 1024; // 8MB

  // Read whole stream into memory in 8MB increments via an upload session.
  // This streams to Dropbox without depending on a known total size up front.
  const buffers: Buffer[] = [];
  for await (const c of data) buffers.push(c as Buffer);
  const full = Buffer.concat(buffers);
  const total = full.length;

  if (total <= CHUNK) {
    await client.filesUpload({ path, contents: full, mode: { ".tag": "overwrite" } });
    return { ref: path, size: total };
  }

  // Chunked upload session for larger artifacts.
  let offset = 0;
  const first = full.subarray(0, CHUNK);
  const start = await client.filesUploadSessionStart({ contents: first, close: false });
  const sessionId = start.result.session_id;
  offset += first.length;

  while (offset < total) {
    const end = Math.min(offset + CHUNK, total);
    const part = full.subarray(offset, end);
    const isLast = end >= total;
    if (isLast) {
      await client.filesUploadSessionFinish({
        contents: part,
        cursor: { session_id: sessionId, offset },
        commit: { path, mode: { ".tag": "overwrite" } },
      });
    } else {
      await client.filesUploadSessionAppendV2({
        contents: part,
        cursor: { session_id: sessionId, offset },
        close: false,
      });
    }
    offset = end;
  }
  return { ref: path, size: total };
}

export async function list(
  dest: Destination,
  targetId: string
): Promise<StoredArtifact[]> {
  const client = dbx(dest);
  try {
    const res = await client.filesListFolder({ path: folderPath(dest, targetId) });
    return res.result.entries
      .filter((e) => e[".tag"] === "file")
      .map((e: any) => ({
        ref: e.path_lower,
        name: e.name,
        mtime: e.server_modified ? Date.parse(e.server_modified) : 0,
        size: e.size || 0,
      }));
  } catch (err: any) {
    // path/not_found => no backups yet
    if (String(err?.error?.error_summary || "").includes("not_found")) return [];
    throw err;
  }
}

export async function remove(dest: Destination, ref: string): Promise<void> {
  await dbx(dest).filesDeleteV2({ path: ref });
}

export async function test(dest: Destination): Promise<void> {
  await dbx(dest).usersGetCurrentAccount();
}
