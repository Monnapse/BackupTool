import type { DbKind, TargetConfig } from "../types";

// Builds the in-container command that streams a compressed dump to stdout.
// We shell out via `sh -c` and pipe through gzip so artifacts arrive compressed.
// Passwords are passed via environment variables, never on the command line.

export interface DumpPlan {
  cmd: string[];
  env: string[];
  /** File extension for the produced artifact (already includes leading dot). */
  ext: string;
}

function shQuote(v: string): string {
  return `'${v.replace(/'/g, `'\\''`)}'`;
}

export function buildDumpPlan(kind: DbKind, cfg: TargetConfig): DumpPlan {
  switch (kind) {
    case "postgres": {
      const user = cfg.user || "postgres";
      const db = cfg.database?.trim();
      const dump = db
        ? `pg_dump -U ${shQuote(user)} ${shQuote(db)}`
        : `pg_dumpall -U ${shQuote(user)}`;
      return {
        cmd: ["sh", "-c", `${dump} | gzip -c`],
        env: [`PGPASSWORD=${cfg.password || ""}`],
        ext: ".sql.gz",
      };
    }

    case "mysql": {
      const user = cfg.user || "root";
      const db = cfg.database?.trim();
      const target = db ? shQuote(db) : "--all-databases";
      // MYSQL_PWD is read by mysqldump; works for mariadb's mysqldump too.
      return {
        cmd: ["sh", "-c", `mysqldump -u ${shQuote(user)} ${target} | gzip -c`],
        env: [`MYSQL_PWD=${cfg.password || ""}`],
        ext: ".sql.gz",
      };
    }

    case "mongodb": {
      const parts = ["mongodump", "--archive", "--gzip"];
      if (cfg.user) {
        parts.push(`--username=${shQuote(cfg.user)}`);
        parts.push(`--password=${shQuote(cfg.password || "")}`);
        parts.push(`--authenticationDatabase=${shQuote(cfg.authDb || "admin")}`);
      }
      if (cfg.database?.trim()) parts.push(`--db=${shQuote(cfg.database.trim())}`);
      return {
        cmd: ["sh", "-c", parts.join(" ")],
        env: [],
        ext: ".archive.gz",
      };
    }

    case "files": {
      const paths = (cfg.paths || []).filter(Boolean);
      if (paths.length === 0) {
        throw new Error("No paths configured for files backup.");
      }
      // Archive relative to / and strip the leading slash so tar doesn't warn.
      const quoted = paths.map((p) => shQuote(p.replace(/^\/+/, ""))).join(" ");
      return {
        cmd: ["sh", "-c", `tar -czf - -C / ${quoted}`],
        env: [],
        ext: ".tar.gz",
      };
    }

    default:
      throw new Error(`Unsupported db kind: ${kind}`);
  }
}
