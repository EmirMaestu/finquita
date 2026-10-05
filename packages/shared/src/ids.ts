import { v7 } from "uuid";

/** IDs UUIDv7: se generan en el dispositivo y se ordenan por tiempo. */
export function newId(): string {
  return v7();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
