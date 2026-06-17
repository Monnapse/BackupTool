import Docker from "dockerode";
import { PassThrough, Writable } from "node:stream";
import type { ContainerInfo, DbKind, TargetConfig } from "./types";

// Connects to the Docker daemon over a unix socket (Linux/macOS) or TCP
// (Windows: enable "Expose daemon on tcp://..." in Docker Desktop).

let _docker: Docker | null = null;

export function docker(): Docker {
  if (_docker) return _docker;
  const sock = process.env.DOCKER_SOCKET || "/var/run/docker.sock";
  if (sock.startsWith("tcp://") || sock.startsWith("http://")) {
    const url = new URL(sock.replace("tcp://", "http://"));
    _docker = new Docker({ host: url.hostname, port: Number(url.port) || 2375 });
  } else if (sock.includes("pipe")) {
    // Windows named pipe (e.g. //./pipe/docker_engine). dockerode needs
    // backslashes for the pipe path.
    const pipe = sock.replace(/^npipe:\/\//, "").replace(/\//g, "\\");
    _docker = new Docker({ socketPath: pipe });
  } else {
    _docker = new Docker({ socketPath: sock });
  }
  return _docker;
}

/** Guess a DB kind from the container image name. */
function guessKind(image: string): DbKind | null {
  const i = image.toLowerCase();
  if (i.includes("postgres") || i.includes("pgvector") || i.includes("timescale")) return "postgres";
  if (i.includes("mysql") || i.includes("mariadb") || i.includes("percona")) return "mysql";
  if (i.includes("mongo")) return "mongodb";
  return null;
}

/** Pull connection details out of common DB images' environment variables. */
function detectConfig(kind: DbKind | null, env: string[]): TargetConfig {
  const map: Record<string, string> = {};
  for (const e of env) {
    const idx = e.indexOf("=");
    if (idx > 0) map[e.slice(0, idx)] = e.slice(idx + 1);
  }
  if (kind === "postgres") {
    return {
      user: map.POSTGRES_USER || "postgres",
      password: map.POSTGRES_PASSWORD || "",
      database: map.POSTGRES_DB || "",
      port: 5432,
    };
  }
  if (kind === "mysql") {
    return {
      user: "root",
      password: map.MYSQL_ROOT_PASSWORD || map.MARIADB_ROOT_PASSWORD || "",
      database: map.MYSQL_DATABASE || map.MARIADB_DATABASE || "",
      port: 3306,
    };
  }
  if (kind === "mongodb") {
    return {
      user: map.MONGO_INITDB_ROOT_USERNAME || "",
      password: map.MONGO_INITDB_ROOT_PASSWORD || "",
      database: map.MONGO_INITDB_DATABASE || "",
      authDb: "admin",
      port: 27017,
    };
  }
  return {};
}

export async function listContainers(): Promise<ContainerInfo[]> {
  const list = await docker().listContainers({ all: true });
  const out: ContainerInfo[] = [];
  for (const c of list) {
    const name = (c.Names?.[0] || c.Id).replace(/^\//, "");
    const kind = guessKind(c.Image);
    let detected: TargetConfig = {};
    try {
      const info = await docker().getContainer(c.Id).inspect();
      detected = detectConfig(kind, info.Config?.Env || []);
    } catch {
      // ignore inspect failures; user can fill in manually
    }
    out.push({
      id: c.Id,
      name,
      image: c.Image,
      state: c.State,
      status: c.Status,
      guessedKind: kind,
      detected,
    });
  }
  return out;
}

export interface ExecResult {
  exitCode: number;
  stderr: string;
  bytes: number;
}

/**
 * Run a command inside a container, streaming stdout to `dest`.
 * stderr is captured separately so it doesn't corrupt the dump.
 */
export async function execStreamToWritable(
  containerId: string,
  cmd: string[],
  env: string[],
  dest: Writable
): Promise<ExecResult> {
  const container = docker().getContainer(containerId);
  const exec = await container.exec({
    Cmd: cmd,
    Env: env,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  const stdout = new PassThrough();
  const stderrChunks: Buffer[] = [];
  const stderr = new Writable({
    write(chunk, _enc, cb) {
      stderrChunks.push(Buffer.from(chunk));
      cb();
    },
  });

  let bytes = 0;
  stdout.on("data", (b: Buffer) => {
    bytes += b.length;
  });
  stdout.pipe(dest, { end: true });

  // Docker multiplexes stdout/stderr on one stream; demux splits them.
  docker().modem.demuxStream(stream, stdout, stderr);

  await new Promise<void>((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const info = await exec.inspect();
  return {
    exitCode: info.ExitCode ?? 0,
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
    bytes,
  };
}

/** Quick connectivity check used by the dashboard. */
export async function pingDocker(): Promise<{ ok: boolean; error?: string }> {
  try {
    await docker().ping();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
