import { google, drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import type { Destination } from "../types";
import type { StoredArtifact } from "./index";

// Google Drive destination.
// config: { refresh_token: string, rootFolderId?: string }
// OAuth client id/secret come from env (GOOGLE_CLIENT_ID/SECRET). The connect
// flow lives in /api/destinations/oauth/google.

export function oauthClient() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not configured.");
  }
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return new google.auth.OAuth2(id, secret, `${base}/api/destinations/oauth/google/callback`);
}

function driveFor(dest: Destination): drive_v3.Drive {
  const refresh = dest.config.refresh_token as string;
  if (!refresh) throw new Error("Google Drive destination is not connected.");
  const client = oauthClient();
  client.setCredentials({ refresh_token: refresh });
  return google.drive({ version: "v3", auth: client });
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
