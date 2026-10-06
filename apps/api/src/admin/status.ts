// apps/api/src/admin/status.ts
import { readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client";
import type { AdminConfig } from "./session";

export const BACKUP_RE = /^mostrador-\d{4}-\d{2}-\d{2}\.dump$/;
export const WORKER_STALE_MS = 30 * 60_000;
export const BACKUP_STALE_MS = 36 * 60 * 60_000;

export type Backup = { name: string; size: number; modifiedAt: Date };

export type SystemStatus = {
  version: string;
  startedAt: Date;
  db: { ok: boolean; ms: number | null; sizeBytes: number | null };
  worker: { lastRun: Date | null; stale: boolean };
  disk: { freeBytes: number; totalBytes: number } | null;
  lastBackup: Backup | null;
  backupStale: boolean;
};

/** Copias diarias (las deja backup.sh en el VPS), de la más nueva a la más vieja. */
export async function listBackups(dir: string): Promise<Backup[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: Backup[] = [];
  for (const name of names.filter((n) => BACKUP_RE.test(n))) {
    const s = await stat(join(dir, name));
    out.push({ name, size: s.size, modifiedAt: s.mtime });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

export async function systemStatus(
  db: Db,
  cfg: AdminConfig,
  now = new Date(),
): Promise<SystemStatus> {
  const dbStatus: SystemStatus["db"] = { ok: false, ms: null, sizeBytes: null };
  let lastRun: Date | null = null;
  try {
    const t = performance.now();
    await db.execute(sql`select 1`);
    dbStatus.ms = Math.round(performance.now() - t);
    dbStatus.ok = true;
    const [size] = await db.execute<{ size: string }>(
      sql`select pg_database_size(current_database())::text as size`,
    );
    dbStatus.sizeBytes = Number(size?.size ?? 0);
  } catch {}
  if (dbStatus.ok) {
    try {
      // pg-boss guarda las tareas en su propio esquema; en los tests no existe.
      const [row] = await db.execute<{ epoch: number | null }>(
        sql`select extract(epoch from max(completed_on))::float8 as epoch
            from pgboss.job where name = 'checks' and state = 'completed'`,
      );
      lastRun = row?.epoch ? new Date(row.epoch * 1000) : null;
    } catch {}
  }

  let disk: SystemStatus["disk"] = null;
  try {
    const s = await statfs(cfg.backupsDir);
    disk = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {}

  const [lastBackup = null] = await listBackups(cfg.backupsDir);
  return {
    version: cfg.version,
    startedAt: cfg.startedAt,
    db: dbStatus,
    worker: {
      lastRun,
      stale: !lastRun || now.getTime() - lastRun.getTime() > WORKER_STALE_MS,
    },
    disk,
    lastBackup,
    backupStale: !lastBackup || now.getTime() - lastBackup.modifiedAt.getTime() > BACKUP_STALE_MS,
  };
}
