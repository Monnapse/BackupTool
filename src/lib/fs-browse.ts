import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

// Filesystem browser for the "Local / mounted drive" destination picker.
// Enumerates the drives/mounts the *app process* can see (in Docker that means
// whatever volumes are mounted in), plus lets the UI drill into folders.

export interface DriveInfo {
  /** Absolute root path of the drive/mount. */
  path: string;
  /** Friendly label (drive letter, volume/mount name). */
  label: string;
  type: "fixed" | "removable" | "mount";
  total: number | null;
  free: number | null;
}

export interface DirEntry {
  name: string;
  path: string;
}

export interface DirListing {
  path: string;
  parent: string | null;
  writable: boolean;
  dirs: DirEntry[];
}

function sizeOf(p: string): { total: number | null; free: number | null } {
  try {
    // @ts-ignore statfsSync exists on Node >= 18.15
    const s = fs.statfsSync(p);
    return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return { total: null, free: null };
  }
}

/** Decode octal escapes (\040 etc.) used in /proc/mounts. */
function unescapeMount(s: string): string {
  return s.replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
}

function listWindowsDrives(): DriveInfo[] {
  const out: DriveInfo[] = [];
  for (let c = 65; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    if (!fs.existsSync(root)) continue;
    const { total, free } = sizeOf(root);
    out.push({
      path: root,
      label: `${String.fromCharCode(c)}:`,
      // We can't cheaply tell removable vs fixed without native calls; C: is
      // almost always the system drive, the rest are likely external/removable.
      type: c === 67 ? "fixed" : "removable",
      total,
      free,
    });
  }
  return out;
}

function listUnixMounts(): DriveInfo[] {
  const out: DriveInfo[] = [];
  const seen = new Set<string>();

  const add = (mountPath: string, type: DriveInfo["type"]) => {
    if (seen.has(mountPath)) return;
    if (!fs.existsSync(mountPath)) return;
    seen.add(mountPath);
    const { total, free } = sizeOf(mountPath);
    out.push({
      path: mountPath,
      label: mountPath === "/" ? "/ (root)" : path.basename(mountPath) || mountPath,
      type,
      total,
      free,
    });
  };

  // Real, mounted block devices from /proc/mounts (Linux).
  try {
    const mounts = fs.readFileSync("/proc/mounts", "utf8").trim().split("\n");
    for (const line of mounts) {
      const [dev, mntRaw] = line.split(" ");
      if (!dev?.startsWith("/dev/")) continue; // skip pseudo filesystems
      const mnt = unescapeMount(mntRaw);
      const removable = /^\/(media|mnt|run\/media)\b/.test(mnt);
      add(mnt, removable ? "removable" : "mount");
    }
  } catch {
    // not Linux, or no /proc — fall through to scanned roots below
  }

  // Common removable-mount parents (in case the child wasn't a block device,
  // e.g. bind-mounted into the container).
  for (const base of ["/media", "/run/media", "/mnt", "/Volumes"]) {
    try {
      for (const name of fs.readdirSync(base)) {
        const full = path.join(base, name);
        if (fs.statSync(full).isDirectory()) add(full, "removable");
      }
    } catch {
      /* base doesn't exist */
    }
  }

  add("/", "fixed");
  return out;
}

export function listDrives(): DriveInfo[] {
  const drives = process.platform === "win32" ? listWindowsDrives() : listUnixMounts();

  // Always offer the app's configured default backup dir as a convenience entry.
  const def = process.env.BACKUP_DIR;
  if (def && fs.existsSync(def) && !drives.some((d) => d.path === def)) {
    const { total, free } = sizeOf(def);
    drives.unshift({ path: def, label: `${path.basename(def)} (default)`, type: "mount", total, free });
  }
  return drives;
}

/** Optional jail: if FS_BROWSE_ROOT is set, refuse to list outside it. */
function assertAllowed(target: string) {
  const root = process.env.FS_BROWSE_ROOT;
  if (!root) return;
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path is outside the allowed browse root.");
  }
}

export async function listDir(target: string): Promise<DirListing> {
  const resolved = path.resolve(target);
  assertAllowed(resolved);

  const entries = await fsp.readdir(resolved, { withFileTypes: true });
  const dirs: DirEntry[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue; // hide dotfolders
    dirs.push({ name: e.name, path: path.join(resolved, e.name) });
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));

  let writable = true;
  try {
    fs.accessSync(resolved, fs.constants.W_OK);
  } catch {
    writable = false;
  }

  const parent = path.dirname(resolved);
  return {
    path: resolved,
    parent: parent === resolved ? null : parent,
    writable,
    dirs,
  };
}

/** Create a subfolder (used by the "new folder" button in the picker). */
export async function makeDir(parent: string, name: string): Promise<string> {
  const resolved = path.resolve(parent, name);
  assertAllowed(resolved);
  await fsp.mkdir(resolved, { recursive: true });
  return resolved;
}

export const homeDir = () => os.homedir();
