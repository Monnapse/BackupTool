import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

const run = promisify(execFile);

// Automount: makes "plug in an SD card / USB stick and it just works" true on
// headless hosts, where nothing auto-mounts removable media. We watch the
// kernel's block-device list; when a removable device with a filesystem shows
// up unmounted, we mount it ourselves under /mnt/auto/<label>. When the device
// is yanked, we lazy-unmount. Requires CAP_SYS_ADMIN + /dev (see
// docker-compose.yml); without them every attempt fails cleanly and the drive
// picker explains what's missing.

const AUTO_DIR = "/mnt/auto";
const TICK_MS = 5_000;
const RETRY_MS = 60_000; // failed devices are retried on a slower cadence

export interface BlockedDevice {
  /** e.g. /dev/mmcblk0p1 */
  device: string;
  label: string | null;
  reason: string;
}

interface AutomountState {
  /** device path -> our mountpoint */
  managed: Map<string, string>;
  /** device path -> why it couldn't be mounted */
  blocked: Map<string, BlockedDevice & { nextTry: number }>;
  timer: NodeJS.Timeout | null;
}

// globalThis so route handlers and instrumentation see the same state even if
// Next bundles this module twice.
const state: AutomountState = ((globalThis as any).__automount ??= {
  managed: new Map(),
  blocked: new Map(),
  timer: null,
});

/** Devices we found but couldn't mount, for the drive picker to explain. */
export function automountBlocked(): BlockedDevice[] {
  return [...state.blocked.values()].map(({ device, label, reason }) => ({ device, label, reason }));
}

export function startAutomount() {
  if (state.timer) return;
  if (process.platform !== "linux") return;
  if (process.env.AUTOMOUNT === "0" || process.env.AUTOMOUNT === "false") return;
  if (!fs.existsSync("/sys/class/block")) return;
  state.timer = setInterval(() => void tick().catch(() => {}), TICK_MS);
  state.timer.unref?.();
  void tick().catch(() => {});
  console.log("[automount] watching for removable drives (disable with AUTOMOUNT=0)");
}

function read(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return null;
  }
}

/** Parent disk of a partition name: mmcblk0p1 → mmcblk0, sda1 → sda. */
function parentDisk(name: string): string {
  return (
    name.match(/^(mmcblk\d+)p\d+$/)?.[1] ||
    name.match(/^([a-z]+)\d+$/)?.[1] ||
    name
  );
}

/** Only touch genuinely removable media: USB disks (removable flag) and SD
 * cards in built-in readers (mmc type "SD"; eMMC system storage says "MMC"). */
function isRemovableMedia(disk: string): boolean {
  if (read(`/sys/class/block/${disk}/removable`) === "1") return true;
  if (/^mmcblk\d+$/.test(disk)) {
    return read(`/sys/class/block/${disk}/device/type`)?.toUpperCase() === "SD";
  }
  return false;
}

interface Probe {
  label: string | null;
  fstype: string | null;
}

/** busybox blkid: `/dev/sda1: LABEL="X" UUID="..." TYPE="vfat"` */
async function probe(device: string): Promise<Probe> {
  try {
    const { stdout } = await run("blkid", [device]);
    return {
      label: stdout.match(/LABEL="([^"]*)"/)?.[1] ?? null,
      fstype: stdout.match(/TYPE="([^"]*)"/)?.[1] ?? null,
    };
  } catch {
    return { label: null, fstype: null }; // no recognizable filesystem
  }
}

function friendlyMountError(e: any, fstype: string): string {
  const msg = String(e?.stderr || e?.message || e).trim();
  if (/permission denied|operation not permitted|must be superuser/i.test(msg)) {
    return "the container lacks mount privileges — redeploy the stack with the updated docker-compose.yml (cap_add: SYS_ADMIN, /dev, apparmor:unconfined)";
  }
  if (/unknown filesystem|invalid argument|bad superblock/i.test(msg)) {
    return `the host kernel can't mount "${fstype}" (exFAT cards need the exfat module on the host: modprobe exfat)`;
  }
  return msg.slice(0, 300);
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Mounted device paths + mountpoints, as this container sees them. */
function currentMounts(): { devices: Set<string>; mountpoints: Set<string> } {
  const devices = new Set<string>();
  const mountpoints = new Set<string>();
  try {
    for (const line of fs.readFileSync("/proc/mounts", "utf8").split("\n")) {
      const [dev, mnt] = line.split(" ");
      if (dev?.startsWith("/dev/")) devices.add(dev);
      if (mnt) mountpoints.add(mnt);
    }
  } catch {
    /* ignore */
  }
  return { devices, mountpoints };
}

async function tick() {
  const mounts = currentMounts();

  // 1. Unmount anything we mounted whose device has been yanked.
  for (const [device, mountPath] of state.managed) {
    if (fs.existsSync(device)) continue;
    try {
      await run("umount", ["-l", mountPath]);
    } catch {
      /* already gone */
    }
    await fsp.rmdir(mountPath).catch(() => {});
    state.managed.delete(device);
    console.log(`[automount] ${device} removed — unmounted ${mountPath}`);
  }
  // Forget blocked devices that were unplugged.
  for (const [device, b] of state.blocked) {
    if (!fs.existsSync(device)) state.blocked.delete(device);
  }

  // 2. Find unmounted removable filesystems and mount them.
  let names: string[];
  try {
    names = await fsp.readdir("/sys/class/block");
  } catch {
    return;
  }
  const nameSet = new Set(names);

  for (const name of names) {
    if (!/^(sd[a-z]+\d*|mmcblk\d+(p\d+)?)$/.test(name)) continue;

    const isPartition = fs.existsSync(`/sys/class/block/${name}/partition`);
    const disk = isPartition ? parentDisk(name) : name;
    if (!isRemovableMedia(disk)) continue;

    // Whole disks are only candidates when they have no partitions
    // (cards formatted without a partition table).
    if (!isPartition) {
      const hasPartitions = [...nameSet].some(
        (n) => n !== name && parentDisk(n) === name && fs.existsSync(`/sys/class/block/${n}/partition`)
      );
      if (hasPartitions) continue;
    }

    const device = `/dev/${name}`;
    if (!fs.existsSync(device)) continue; // no node — /dev not mounted in?
    if (mounts.devices.has(device)) {
      state.blocked.delete(device); // mounted (by host propagation or us) — all good
      continue;
    }
    if (state.managed.has(device)) continue;

    const b = state.blocked.get(device);
    if (b && Date.now() < b.nextTry) continue; // back off failed devices

    const { label, fstype } = await probe(device);
    if (!fstype || fstype === "swap") continue; // nothing mountable on it

    const dirName = sanitize(label || name);
    let mountPath = path.join(AUTO_DIR, dirName);
    if (mounts.mountpoints.has(mountPath)) mountPath = path.join(AUTO_DIR, `${dirName}-${name}`);

    try {
      await fsp.mkdir(mountPath, { recursive: true });
      await run("mount", ["-t", fstype, device, mountPath]);
      state.managed.set(device, mountPath);
      state.blocked.delete(device);
      console.log(`[automount] mounted ${device} (${fstype}${label ? `, "${label}"` : ""}) at ${mountPath}`);
    } catch (e: any) {
      await fsp.rmdir(mountPath).catch(() => {});
      const reason = friendlyMountError(e, fstype);
      if (!b || b.reason !== reason) {
        console.warn(`[automount] cannot mount ${device}: ${reason}`);
      }
      state.blocked.set(device, { device, label, reason, nextTry: Date.now() + RETRY_MS });
    }
  }
}
