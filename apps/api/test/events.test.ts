import { newId } from "@mostrador/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { createDb } from "../src/db/client";
import { EventHub } from "../src/lib/events";
import { as, MAC_TOKEN } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { op, openShift, saleOf } from "./helpers/ops";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
let hub: EventHub;
let listener: ReturnType<typeof createDb>;

beforeAll(async () => {
  hub = new EventHub();
  listener = createDb(ref.t.url, { max: 1 });
  await hub.listen(listener.sql);
});
afterAll(async () => {
  await hub.close();
  await listener.sql.end();
});

/** Lee el stream SSE hasta encontrar un evento o agotar el tiempo. */
async function readUntil(body: ReadableStream<Uint8Array>, event: string, ms = 5000) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + ms;
  try {
    while (Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((r) =>
          setTimeout(() => r({ done: true, value: undefined }), deadline - Date.now()),
        ),
      ]);
      if (chunk.done) break;
      text += decoder.decode(chunk.value);
      if (text.includes(`event: ${event}`)) {
        const block = text.slice(text.indexOf(`event: ${event}`)).split("\n\n")[0] ?? "";
        return { found: true, block, text };
      }
    }
    return { found: false, block: "", text };
  } finally {
    await reader.cancel().catch(() => {});
  }
}

describe("SSE /api/events", () => {
  it("un push dispara el aviso de cambios a los dispositivos conectados", async () => {
    const app = createApp({ db: ref.t.db, auth: TEST_AUTH, events: hub });
    const mac = await as(app, ref.t.db, "tomas");
    const res = await app.request("http://localhost/api/events", {
      headers: { "x-device-token": MAC_TOKEN, authorization: `Bearer ${mac.pinToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = res.body;
    if (!body) throw new Error("sin cuerpo");
    const reading = readUntil(body, "changes");
    // Otro dispositivo vende: cambia el stock de la Coca-Cola.
    const shiftId = newId();
    await new Promise((r) => setTimeout(r, 100));
    const push = await mac.post("/api/sync/push", {
      deviceNow: new Date().toISOString(),
      ops: [openShift(shiftId), op("sale.create", saleOf(shiftId, [{ key: "coca" }]))],
    });
    expect(push.body.results.every((r: { status: string }) => r.status === "applied")).toBe(true);
    const got = await reading;
    expect(got.found, got.text).toBe(true);
    const data = JSON.parse(got.block.split("data: ")[1] ?? "{}");
    expect(data.entities).toEqual(expect.arrayContaining(["products", "shifts"]));
  });

  it("sin sesión no se conecta", async () => {
    const app = createApp({ db: ref.t.db, auth: TEST_AUTH, events: hub });
    expect((await app.request("/api/events")).status).toBe(401);
  });

  it("al cortarse la conexión deja de escuchar", async () => {
    const app = createApp({ db: ref.t.db, auth: TEST_AUTH, events: hub });
    const mac = await as(app, ref.t.db, "tomas");
    const controller = new AbortController();
    const before = hub.size;
    const res = await app.request("http://localhost/api/events", {
      headers: { "x-device-token": MAC_TOKEN, authorization: `Bearer ${mac.pinToken}` },
      signal: controller.signal,
    });
    const ready = await readUntil(res.body as ReadableStream<Uint8Array>, "ready");
    expect(ready.found).toBe(true);
    controller.abort();
    await new Promise((r) => setTimeout(r, 1500));
    expect(hub.size).toBe(before);
  });
});
