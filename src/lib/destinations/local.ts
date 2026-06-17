import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { Destination } from "../types";
import type { StoredArtifact } from "./index";

// Local / mounted-drive destination (SD card, USB, NFS/SMB mount, etc.).
// config: { path: string }  — base directory inside the container.

function baseDir(dest: Destination): string {
  const p = (dest.config.path as string) || process.env.BACKUP_DIR || "/backups";
  return p;
}

function targetDir(dest: Destination, targetId: string): string {
  return path.join(baseDir(dest), targetId);
}

export async function upload(
  dest: Destination,
  targetId: string,
  filename: string,
  data: Readable
): Promise<{ ref: string; size: number }> {
  const dir = targetDir(dest, targetId);
  await fsp.mkdir(dir, { recursive: true });
  const full = path.join(dir, filename);
  const tmp = full + ".part";

  await pipeline(data, fs.createWriteStream(tmp));
  await fsp.rename(tmp, full);
  const stat = await fsp.stat(full);
  return { ref: full, size: stat.size };
}

export async function list(
  dest: Destination,
  targetId: string
): Promise<StoredArtifact[]> {
  const dir = targetDir(dest, targetId);
  let names: string[];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const out: StoredArtifact[] = [];
  for (const name of names) {
    if (name.endsWith(".part")) continue;
    const full = path.join(dir, name);
    try {
      const st = await fsp.stat(full);
      if (st.isFile()) out.push({ ref: full, name, mtime: st.mtimeMs, size: st.size });
    } catch {
      // skip
    }
  }
  return out;
}

export async function remove(_dest: Destination, ref: string): Promise<void> {
  await fsp.rm(ref, { force: true });
}

export async function test(dest: Destination): Promise<void> {
  const dir = baseDir(dest);
  await fsp.mkdir(dir, { recursive: true });
  // Verify we can actually write.
  const probe = path.join(dir, `.bt-write-test-${Date.now()}`);
  await fsp.writeFile(probe, "ok");
  await fsp.rm(probe, { force: true });
}
