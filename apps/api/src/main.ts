import { createApp } from "./app";
import { createDb, databaseUrl } from "./db/client";
import { EventHub } from "./lib/events";
import { log } from "./lib/log";

const port = Number(process.env.PORT ?? 3000);
const { db, sql } = createDb(databaseUrl());
const events = new EventHub();
await events.listen(sql);
const app = createApp({ db, events });

log.info("api escuchando", { port });

export default { port, fetch: app.fetch, idleTimeout: 0 };
