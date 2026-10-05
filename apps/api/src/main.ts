import { createApp } from "./app";
import { createDb, databaseUrl } from "./db/client";
import { log } from "./lib/log";

const port = Number(process.env.PORT ?? 3000);
const { db } = createDb(databaseUrl());
const app = createApp({ db });

log.info("api escuchando", { port });

export default { port, fetch: app.fetch, idleTimeout: 0 };
