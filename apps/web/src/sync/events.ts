import { credentials } from "../data/api";

export type SseEvent = { event: string; data: string };

/** Parser incremental de Server-Sent Events: devuelve los eventos completos y el resto. */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const events: SseEvent[] = [];
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

/**
 * Escucha /api/events con fetch (EventSource no manda las cabeceras del dispositivo).
 * Ante "changes" llama a onChanges; si se corta, reintenta con espera creciente.
 */
export function listenServerEvents(onChanges: () => void, url = "/api/events"): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let wait = 1000;

  const connect = async () => {
    while (!stopped) {
      controller = new AbortController();
      try {
        const { deviceToken, pinToken } = credentials.get();
        const headers: Record<string, string> = { accept: "text/event-stream" };
        if (deviceToken) headers["x-device-token"] = deviceToken;
        if (pinToken) headers.authorization = `Bearer ${pinToken}`;
        const res = await fetch(url, {
          headers,
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
        wait = 1000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseSse(buffer);
          buffer = parsed.rest;
          if (parsed.events.some((e) => e.event === "changes" || e.event === "ready")) onChanges();
        }
      } catch {
        if (stopped) return;
      }
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 30_000);
    }
  };
  void connect();
  return () => {
    stopped = true;
    controller?.abort();
  };
}
