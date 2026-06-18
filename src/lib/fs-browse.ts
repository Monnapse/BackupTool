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

// Filesystems that aren't real storage and should never appear as a "drive".
const PSEUDO_FS = new Set([
  "proc", "sysfs", "tmpfs", "devtmpfs", "devpts", "mqueue", "cgroup", "cgroup2",
  "securityfs", "debugfs", "tracefs", "fusectl", "configfs", "binfmt_misc",
  "hugetlbfs", "pstore", "bpf", "autofs", "nsfs", "ramfs", "fuse.lxcfs",
]);

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** A path is a real mount if its device differs from its parent's. */
function isMountpoint(p: string): boolean {
  try {
    return fs.statSync(p).dev !== fs.statSync(path.dirname(p)).dev;
  } catch {
    return false;
  }
}

/** System paths that aren't useful backup targets. */
function isSystemPath(p: string): boolean {
  if (["/proc", "/sys", "/dev", "/etc", "/run"].some((s) => p === s || p.startsWith(s + "/"))) {
    return !p.startsWith("/run/media"); // keep removable mounts under /run/media
  }
  return false;
}

// Bare mount-parent dirs — these hold drives, they aren't drives themselves.
const PARENT_DIRS = new Set(["/media", "/run/media", "/mnt", "/Volumes"]);

function listUnixMounts(): DriveInfo[] {
  const out: DriveInfo[] = [];
  const seen = new Set<string>();
  const dataDir = process.env.DATA_DIR; // app's own config dir — not a backup target

  const add = (mountPath: string, type: DriveInfo["type"]) => {
    if (seen.has(mountPath) || mountPath === dataDir) return;
    if (mountPath === "/" || PARENT_DIRS.has(mountPath)) return; // skip container internals
    if (!isDir(mountPath)) return; // skip Docker's injected file mounts (resolv.conf, etc.)
    seen.add(mountPath);
    const { total, free } = sizeOf(mountPath);
    out.push({
      path: mountPath,
      label: path.basename(mountPath) || mountPath,
      type,
      total,
      free,
    });
  };

  // Real mounted filesystems from /proc/mounts (Linux). We only surface actual
  // drives — not the container's overlay root or the bare /media,/mnt parents.
  try {
    const mounts = fs.readFileSync("/proc/mounts", "utf8").trim().split("\n");
    for (const line of mounts) {
      const [dev, mntRaw, fstype] = line.split(" ");
      if (!mntRaw || PSEUDO_FS.has(fstype)) continue;
      // Drop stale mounts: a drive unplugged without unmounting leaves its entry
      // in /proc/mounts, but its /dev node is gone. Hide it so it disappears.
      if (dev.startsWith("/dev/") && !fs.existsSync(dev)) continue;
      const mnt = unescapeMount(mntRaw);
      if (isSystemPath(mnt)) continue;
      const removable = /^\/(media|mnt|run\/media)\b/.test(mnt);
      add(mnt, removable ? "removable" : "mount");
    }
  } catch {
    // not Linux, or no /proc — fall through to scanned roots below
  }

  // Removable drives that auto-mount under these parents. Only count entries
  // that are genuinely mounted (a real device), not empty placeholder folders.
  for (const base of PARENT_DIRS) {
    try {
      for (const name of fs.readdirSync(base)) {
        const full = path.join(base, name);
        // /run/media nests one level deeper: /run/media/<user>/<label>
        if (isMountpoint(full)) add(full, "removable");
        else if (isDir(full)) {
          try {
            for (const sub of fs.readdirSync(full)) {
              const subFull = path.join(full, sub);
              if (isMountpoint(subFull)) add(subFull, "removable");
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* base doesn't exist */
    }
  }

  return out;
}

/**
 * Curated mode: if drives are mounted under DRIVES_DIR (default /drives), show
 * EXACTLY those — one entry per subfolder. This is the reliable cross-platform
 * way to expose specific drives (especially on Docker Desktop for Windows, where
 * the container can't see Windows drive letters via /media). Each subfolder is a
 * separate bind mount, so it reports that drive's real free space.
 */
function listCuratedDrives(): DriveInfo[] | null {
  const root = process.env.DRIVES_DIR || "/drives";
  let names: string[];
  try {
    names = fs.readdirSync(root).filter((n) => isDir(path.join(root, n)));
  } catch {
    return null; // /drives not mounted — use auto-detection
  }
  if (names.length === 0) return null;
  return names.sort().map((name) => {
    const p = path.join(root, name);
    const { total, free } = sizeOf(p);
    return { path: p, label: name, type: "removable", total, free };
  });
}

export function listDrives(): DriveInfo[] {
  const curated = listCuratedDrives();
  if (curated) return curated;

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
