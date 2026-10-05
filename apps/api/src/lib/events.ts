import type { Sql } from "postgres";
import { log } from "./log";

export const CHANGES_CHANNEL = "mostrador_changes";

export type HubEvent = { type: "changes"; entity: string };
type Listener = (e: HubEvent) => void;

/**
 * Reparte los NOTIFY de Postgres a los dispositivos conectados por SSE.
 * Funciona aunque el cambio lo haya hecho otro proceso (por ejemplo, el worker).
 */
export class EventHub {
  private listeners = new Set<Listener>();
  private unlisten: (() => Promise<void>) | null = null;

  async listen(sql: Sql): Promise<void> {
    const sub = await sql.listen(CHANGES_CHANNEL, (payload) => {
      this.publish({ type: "changes", entity: payload || "?" });
    });
    this.unlisten = () => sub.unlisten();
  }

  publish(e: HubEvent): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch (err) {
        log.warn("sse: listener falló", { error: String(err) });
      }
    }
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  get size(): number {
    return this.listeners.size;
  }

  async close(): Promise<void> {
    await this.unlisten?.();
    this.listeners.clear();
  }
}
