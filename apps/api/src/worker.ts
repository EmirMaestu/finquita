import { PgBoss } from "pg-boss";
import { createDb, databaseUrl } from "./db/client";
import { dispatchPush, runChecks } from "./domain/checks";
import { log } from "./lib/log";
import { webPushSender } from "./lib/push";

/** Tareas programadas (pg-boss): chequeos de avisos y envío de notificaciones push. */
const url = databaseUrl();
const { db } = createDb(url, { max: 3 });
const boss = new PgBoss(url);
boss.on("error", (err) => log.error("pg-boss", { err: String(err) }));
await boss.start();
await boss.createQueue("checks");
await boss.schedule("checks", "*/10 * * * *", null, { tz: "America/Argentina/Buenos_Aires" });
await boss.work("checks", async () => {
  const r = await runChecks(db);
  log.info("chequeos", r);
});

const send = webPushSender();
if (!send) log.warn("sin claves VAPID: los avisos quedan solo en la campana");
let busy = false;
setInterval(async () => {
  if (!send || busy) return;
  busy = true;
  try {
    await dispatchPush(db, send);
  } catch (err) {
    log.error("push", { err: String(err) });
  } finally {
    busy = false;
  }
}, 15_000);

log.info("worker andando");
