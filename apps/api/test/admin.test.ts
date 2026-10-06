// apps/api/test/admin.test.ts
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AdminConfig } from "../src/admin/session";
import { listBackups, systemStatus } from "../src/admin/status";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "mostrador-backups-"));
  await writeFile(join(dir, "mostrador-2026-10-04.dump"), "copia-vieja");
  await writeFile(join(dir, "mostrador-2026-10-05.dump"), "copia-nueva!");
  await writeFile(join(dir, "otra-cosa.txt"), "no es una copia");
  await utimes(join(dir, "mostrador-2026-10-05.dump"), new Date(), new Date());
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cfg = (): AdminConfig => ({
  password: "una-contraseña-de-admin-larga",
  secret: "secreto-de-test-con-largo-suficiente-1234",
  origin: "http://localhost:5173",
  backupsDir: dir,
  version: "abc1234",
  secure: false,
  startedAt: new Date("2026-10-06T12:00:00Z"),
});

describe("copias", () => {
  it("lista solo las copias, de la más nueva a la más vieja", async () => {
    const list = await listBackups(dir);
    expect(list.map((b) => b.name)).toEqual([
      "mostrador-2026-10-05.dump",
      "mostrador-2026-10-04.dump",
    ]);
    expect(list[0]?.size).toBe(12);
  });

  it("si la carpeta no existe, no hay copias", async () => {
    expect(await listBackups(join(dir, "no-existe"))).toEqual([]);
  });
});

describe("estado del sistema", () => {
  it("junta versión, base, worker, disco y última copia", async () => {
    const s = await systemStatus(ref.t.db, cfg());
    expect(s.version).toBe("abc1234");
    expect(s.db.ok).toBe(true);
    expect(s.db.sizeBytes).toBeGreaterThan(0);
    // En los tests no corre pg-boss: no hay última corrida y se marca como atrasado.
    expect(s.worker.lastRun).toBeNull();
    expect(s.worker.stale).toBe(true);
    expect(s.lastBackup?.name).toBe("mostrador-2026-10-05.dump");
    expect(s.backupStale).toBe(false);
  });
});
