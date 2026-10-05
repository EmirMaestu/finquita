import { sql as rawSql } from "drizzle-orm";
import postgres from "postgres";
import { createDb, type Db } from "../src/db/client";
import { baseTestUrl, TEMPLATE_DB, withDatabase } from "./db-url";

export type TestDb = {
  db: Db;
  url: string;
  /** Vacía todas las tablas (para usar en beforeEach). */
  reset: () => Promise<void>;
  /** Guarda el contenido actual (por ejemplo, después del seed)… */
  snapshot: () => Promise<void>;
  /** …y lo vuelve a dejar igual en cada test. */
  restore: () => Promise<void>;
  close: () => Promise<void>;
};

/** Base propia para un archivo de test, copiada de la plantilla ya migrada. */
export async function createTestDb(): Promise<TestDb> {
  const name = `mt_${process.pid}_${Math.random().toString(36).slice(2, 10)}`;
  const admin = postgres(withDatabase(baseTestUrl(), "postgres"), { max: 1, onnotice: () => {} });
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await admin.unsafe(`create database "${name}" template "${TEMPLATE_DB}"`);
        break;
      } catch (err) {
        // Dos copias a la vez de la misma plantilla chocan: se reintenta.
        if (attempt >= 30) throw err;
        await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
      }
    }
  } finally {
    await admin.end();
  }
  const url = withDatabase(baseTestUrl(), name);
  const { db, sql } = createDb(url, { max: 5 });
  const rows = await db.execute<{ tablename: string }>(
    rawSql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = rows.map((r) => r.tablename);
  const wipe = tables.map((t) => `delete from "public"."${t}";`).join("\n");
  return {
    db,
    url,
    // DELETE con los FK apagados es mucho más rápido que TRUNCATE para tablas chicas.
    reset: async () => {
      await sql.begin(async (tx) => {
        await tx.unsafe(`set local session_replication_role = replica;\n${wipe}`);
      });
    },
    snapshot: async () => {
      const copy = tables
        .map(
          (t) =>
            `drop table if exists snap."${t}"; create table snap."${t}" as table public."${t}";`,
        )
        .join("\n");
      await sql.unsafe(`create schema if not exists snap;\n${copy}`);
    },
    restore: async () => {
      const fill = tables
        .map((t) => `insert into public."${t}" select * from snap."${t}";`)
        .join("\n");
      await sql.begin(async (tx) => {
        await tx.unsafe(`set local session_replication_role = replica;\n${wipe}\n${fill}`);
      });
    },
    close: async () => {
      await sql.end();
      const drop = postgres(withDatabase(baseTestUrl(), "postgres"), {
        max: 1,
        onnotice: () => {},
      });
      await drop.unsafe(`drop database if exists "${name}" with (force)`);
      await drop.end();
    },
  };
}
