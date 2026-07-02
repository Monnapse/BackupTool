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

function isMountpoint(p: string): boolean {
  try {
    return fs.statSync(p).dev !== fs.statSync(path.dirname(p)).dev;
  } catch {
    return false;
  }
}

/**
 * Refuse to write when the drive isn't there. Without this, an unplugged USB
 * drive would silently mkdir its old mountpoint path and "back up" into the
 * container's own filesystem. The base dir must already exist (the user
 * browsed to it when configuring), and paths under the removable-drive
 * parents must actually have a device mounted somewhere along the way.
 */
async function assertAvailable(base: string): Promise<void> {
  let st;
  try {
    st = await fsp.stat(base);
  } catch {
    throw new Error(`Drive/folder not found: ${base} — is the drive plugged in and mounted?`);
  }
  if (!st.isDirectory()) throw new Error(`${base} is not a directory`);

  if (/^\/(media|run\/media|mnt)\//.test(base.replace(/\\/g, "/"))) {
    let p = base;
    let mounted = false;
    while (p !== path.dirname(p)) {
      if (isMountpoint(p)) {
        mounted = true;
        break;
      }
      p = path.dirname(p);
    }
    if (!mounted) {
      throw new Error(`No drive is mounted at ${base} — is the drive plugged in?`);
    }
  }
}

export async function upload(
  dest: Destination,
  targetId: string,
  filename: string,
  data: Readable
): Promise<{ ref: string; size: number }> {
  await assertAvailable(baseDir(dest));
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
  // Must NOT mkdir here: recreating an unplugged drive's mountpoint would make
  // an offline drive look healthy and divert backups onto the wrong disk.
  await assertAvailable(dir);
  // Verify we can actually write.
  const probe = path.join(dir, `.bt-write-test-${Date.now()}`);
  await fsp.writeFile(probe, "ok");
  await fsp.rm(probe, { force: true });
}
