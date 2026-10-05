import { sql as rawSql } from "drizzle-orm";
import postgres from "postgres";
import { createDb, type Db } from "../src/db/client";
import { baseTestUrl, TEMPLATE_DB, withDatabase } from "./db-url";

export type TestDb = {
  db: Db;
  url: string;
  /** Vacía todas las tablas (para usar en beforeEach). */
  reset: () => Promise<void>;
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
  return {
    db,
    url,
    reset: async () => {
      const rows = await db.execute<{ tablename: string }>(
        rawSql`select tablename from pg_tables where schemaname = 'public'`,
      );
      const tables = rows.map((r) => `"public"."${r.tablename}"`);
      if (tables.length) await db.execute(rawSql.raw(`truncate ${tables.join(", ")} cascade`));
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
