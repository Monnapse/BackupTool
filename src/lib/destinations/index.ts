import { Readable } from "node:stream";
import type { Destination } from "../types";
import * as local from "./local";
import * as gdrive from "./gdrive";
import * as dropbox from "./dropbox";

// A destination knows how to: receive a streamed artifact, list existing
// artifacts for a target (for rotation), and delete one. Each backend
// namespaces files per-target via a folder/prefix derived from targetId.

export interface StoredArtifact {
  /** Identifier the backend uses to address the file (path or remote id). */
  ref: string;
  /** Display name. */
  name: string;
  /** Created/modified epoch ms, used to pick the oldest for rotation. */
  mtime: number;
  size: number;
}

export interface DestinationDriver {
  /** Stream `data` to storage under (targetId, filename). Returns its ref + size. */
  upload(
    dest: Destination,
    targetId: string,
    filename: string,
    data: Readable
  ): Promise<{ ref: string; size: number }>;

  /** List artifacts already stored for a target (newest-first not required). */
  list(dest: Destination, targetId: string): Promise<StoredArtifact[]>;

  /** Delete one artifact by its ref. */
  remove(dest: Destination, ref: string): Promise<void>;

  /** Validate config / connectivity. Throws on failure. */
  test(dest: Destination): Promise<void>;
}

const drivers: Record<string, DestinationDriver> = {
  local,
  gdrive,
  dropbox,
};

export function driverFor(dest: Destination): DestinationDriver {
  const d = drivers[dest.kind];
  if (!d) throw new Error(`Unknown destination kind: ${dest.kind}`);
  return d;
}
