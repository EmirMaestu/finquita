import { createDb, databaseUrl } from "../src/db/client";
import { seed } from "../src/seed/seed";

const { db, sql } = createDb(databaseUrl(), { max: 1 });
try {
  await seed(db, { today: process.env.SEED_TODAY });
  console.log(JSON.stringify({ level: "info", msg: "datos de ejemplo cargados" }));
} finally {
  await sql.end();
}
