import { databaseUrl } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";

await runMigrations(databaseUrl());
console.log(JSON.stringify({ level: "info", msg: "migraciones aplicadas" }));
