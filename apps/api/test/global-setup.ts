import postgres from "postgres";
import { runMigrations } from "../src/db/migrate";
import { baseTestUrl, TEMPLATE_DB, withDatabase } from "./db-url";

/** Crea una base plantilla migrada; cada archivo de test la copia a una base propia. */
export default async function setup() {
  const admin = postgres(withDatabase(baseTestUrl(), "postgres"), { max: 1, onnotice: () => {} });
  try {
    const stale = await admin<{ datname: string }[]>`
      select datname from pg_database where datname like 'mt\_%' or datname = ${TEMPLATE_DB}`;
    for (const { datname } of stale) {
      await admin.unsafe(`drop database if exists "${datname}" with (force)`);
    }
    await admin.unsafe(`create database "${TEMPLATE_DB}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(withDatabase(baseTestUrl(), TEMPLATE_DB));
}
