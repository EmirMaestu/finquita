import { localDb } from "../data/db";
import { SyncClient } from "./client";
import { SyncEngine } from "./engine";
import { httpTransport } from "./transport";

let engine: SyncEngine | null = null;
let client: SyncClient | null = null;

export function syncClient(): SyncClient {
  client ??= new SyncClient(localDb(), httpTransport);
  return client;
}

/** El motor de sincronización de la app (uno solo). */
export function syncEngine(): SyncEngine {
  engine ??= new SyncEngine(syncClient());
  return engine;
}
