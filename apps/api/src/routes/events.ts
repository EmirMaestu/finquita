import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";

export const HEARTBEAT_MS = 25_000;

/**
 * GET /api/events: Server-Sent Events. Avisa que hay cambios para bajar (el dispositivo
 * hace un pull). Junta los avisos de 300 ms para no disparar un pull por cada fila.
 */
export function eventRoutes() {
  const r = new Hono<AppEnv>();
  r.get("/events", requireActor(), (c) => {
    const hub = c.get("events");
    return streamSSE(c, async (stream) => {
      let pending = new Set<string>();
      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = async () => {
        timer = null;
        const entities = [...pending];
        pending = new Set();
        if (entities.length)
          await stream.writeSSE({ event: "changes", data: JSON.stringify({ entities }) });
      };
      const off = hub.subscribe((e) => {
        pending.add(e.entity);
        timer ??= setTimeout(() => void flush(), 300);
      });
      const beat = setInterval(
        () => void stream.writeSSE({ event: "ping", data: "" }),
        HEARTBEAT_MS,
      );
      stream.onAbort(() => {
        off();
        clearInterval(beat);
        if (timer) clearTimeout(timer);
      });
      await stream.writeSSE({ event: "ready", data: "" });
      while (!stream.aborted && !stream.closed) await stream.sleep(1000);
      off();
      clearInterval(beat);
    });
  });
  return r;
}
