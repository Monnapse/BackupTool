import { google, drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import type { Destination } from "../types";
import type { StoredArtifact } from "./index";

// Google Drive destination.
// config: { clientId, clientSecret, refresh_token, rootFolderId?, rootFolderName? }
// OAuth client id/secret are entered per-destination in the UI (falling back to
// GOOGLE_CLIENT_ID/SECRET env if present). The connect flow lives in
// /api/destinations/oauth/google.

export function redirectUri(): string {
  const base = (process.env.APP_URL || "http://localhost:8723").replace(/\/$/, "");
  return `${base}/api/destinations/oauth/google/callback`;
}

/** Build an OAuth2 client from explicit creds, or fall back to env. */
export function oauthClient(creds?: { clientId?: string; clientSecret?: string }) {
  const id = creds?.clientId || process.env.GOOGLE_CLIENT_ID;
  const secret = creds?.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("Google client ID/secret are not set for this destination.");
  }
  return new google.auth.OAuth2(id, secret, redirectUri());
}

function clientForDest(dest: Destination) {
  return oauthClient({
    clientId: dest.config.clientId as string,
    clientSecret: dest.config.clientSecret as string,
  });
}

function driveFor(dest: Destination): drive_v3.Drive {
  const refresh = dest.config.refresh_token as string;
  if (!refresh) throw new Error("Google Drive destination is not connected.");
  const client = clientForDest(dest);
  client.setCredentials({ refresh_token: refresh });
  return google.drive({ version: "v3", auth: client });
}

/** List folders under a parent (default: My Drive root) for the folder picker. */
export async function listFolders(
  dest: Destination,
  parentId?: string
): Promise<{ id: string; name: string }[]> {
  const drive = driveFor(dest);
  const parent = parentId || "root";
  const res = await drive.files.list({
    q: `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
    orderBy: "name",
    pageSize: 1000,
    spaces: "drive",
  });
  return (res.data.files || []).map((f) => ({ id: f.id!, name: f.name || f.id! }));
}

async function ensureFolder(
  drive: drive_v3.Drive,
  name: string,
  parent: string | undefined
): Promise<string> {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    parent ? `'${parent}' in parents` : "'root' in parents",
  ].join(" and ");

  const res = await drive.files.list({ q, fields: "files(id)", spaces: "drive" });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id!;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parent ? [parent] : undefined,
    },
    fields: "id",
  });
  return created.data.id!;
}

async function targetFolder(
  drive: drive_v3.Drive,
  dest: Destination,
  targetId: string
): Promise<string> {
  const root = (dest.config.rootFolderId as string) || (await ensureFolder(drive, "BackupTool", undefined));
  return ensureFolder(drive, targetId, root);
}

export async function upload(
  dest: Destination,
  targetId: string,
  filename: string,
  data: Readable
): Promise<{ ref: string; size: number }> {
  const drive = driveFor(dest);
  const folderId = await targetFolder(drive, dest, targetId);
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { body: data },
    fields: "id, size",
  });
  return { ref: res.data.id!, size: Number(res.data.size || 0) };
}

export async function list(
  dest: Destination,
  targetId: string
): Promise<StoredArtifact[]> {
  const drive = driveFor(dest);
  const folderId = await targetFolder(drive, dest, targetId);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, modifiedTime, size)",
    spaces: "drive",
    pageSize: 1000,
  });
  return (res.data.files || []).map((f) => ({
    ref: f.id!,
    name: f.name || f.id!,
    mtime: f.modifiedTime ? Date.parse(f.modifiedTime) : 0,
    size: Number(f.size || 0),
  }));
}

export async function remove(dest: Destination, ref: string): Promise<void> {
  await driveFor(dest).files.delete({ fileId: ref });
}

export async function test(dest: Destination): Promise<void> {
  await driveFor(dest).about.get({ fields: "user" });
}
