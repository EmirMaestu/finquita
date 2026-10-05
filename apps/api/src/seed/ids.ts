import { createHash } from "node:crypto";

/**
 * ID fijo para el escenario de ejemplo: tiene forma de UUIDv7 (con la hora del
 * escenario) pero sale de un hash de la clave, así el seed no duplica al correr dos veces.
 */
export function seedId(key: string): string {
  const hash = createHash("sha256").update(`mostrador:${key}`).digest();
  const ms = Date.UTC(2026, 9, 3, 21, 40); // 3/10/2026 18:40 en Argentina
  const b = Buffer.alloc(16);
  b.writeUIntBE(ms, 0, 6);
  hash.copy(b, 6, 0, 10);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x70;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
