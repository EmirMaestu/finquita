// apps/api/src/admin/session.ts
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Panel de soporte: una contraseña de servidor, sin usuario en la app. */
export type AdminConfig = {
  /** null = panel apagado (falta ADMIN_PASSWORD o es corta). */
  password: string | null;
  secret: string;
  /** Origen del sitio, para rechazar formularios enviados desde otro lado. */
  origin: string;
  backupsDir: string;
  version: string;
  secure: boolean;
  startedAt: Date;
};

export const ADMIN_COOKIE = "mostrador_admin";
export const SESSION_MS = 8 * 60 * 60_000;
export const MIN_ADMIN_PASSWORD = 16;

export function adminConfigFromEnv(): Omit<AdminConfig, "secret" | "origin"> {
  const pw = process.env.ADMIN_PASSWORD ?? "";
  return {
    password: pw.length >= MIN_ADMIN_PASSWORD ? pw : null,
    backupsDir: process.env.BACKUPS_DIR ?? "/backups",
    version: process.env.APP_VERSION ?? "dev",
    secure: process.env.NODE_ENV === "production",
    startedAt: new Date(),
  };
}

/** Compara en tiempo constante (los hash igualan el largo). */
function safeEqual(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

/** La clave depende de la contraseña: si cambia, las sesiones viejas dejan de valer. */
function key(cfg: AdminConfig): Buffer {
  return createHmac("sha256", cfg.secret)
    .update(`admin:${cfg.password ?? ""}`)
    .digest();
}

function sign(cfg: AdminConfig, exp: string): string {
  return createHmac("sha256", key(cfg)).update(exp).digest("base64url");
}

export function signSession(cfg: AdminConfig, now = Date.now()): string {
  const exp = String(now + SESSION_MS);
  return `${exp}.${sign(cfg, exp)}`;
}

export function verifySession(cfg: AdminConfig, value: string | undefined, now = Date.now()) {
  if (!cfg.password || !value) return false;
  const parts = value.split(".");
  if (parts.length !== 2) return false;
  const [exp, sig] = parts;
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) <= now) return false;
  return safeEqual(sig, sign(cfg, exp));
}

export function checkPassword(cfg: AdminConfig, input: string): boolean {
  return cfg.password !== null && safeEqual(input, cfg.password);
}

/** Cinco intentos fallidos desde una IP la bloquean 15 minutos (en memoria: una sola API). */
export class LoginLimiter {
  private fails = new Map<string, { count: number; until: number; last: number }>();

  constructor(
    private max = 5,
    private lockMs = 15 * 60_000,
  ) {}

  /** Cantidad de IPs que se están recordando (para tests). */
  get size(): number {
    return this.fails.size;
  }

  /** Borra la entrada de esta IP si el bloqueo ya venció. */
  private expire(ip: string, now: number) {
    const f = this.fails.get(ip);
    if (f && f.count >= this.max && f.until <= now) this.fails.delete(ip);
  }

  /** Cuando el mapa crece de más, saca lo vencido y lo viejo sin bloqueo. */
  private sweep(now: number) {
    if (this.fails.size <= 1000) return;
    for (const [ip, f] of this.fails) {
      const lockExpired = f.count >= this.max && f.until <= now;
      const stale = f.until === 0 && now - f.last > 15 * 60_000;
      if (lockExpired || stale) this.fails.delete(ip);
    }
  }

  blocked(ip: string, now = Date.now()): boolean {
    this.expire(ip, now);
    const f = this.fails.get(ip);
    return !!f && f.until > now;
  }

  /**
   * Cuenta el intento en el momento, sin esperar a saber si la contraseña era buena:
   * así los pedidos en paralelo no se saltean el límite. Devuelve false si está bloqueada.
   * Un ingreso bueno tiene que llamar a success() para limpiar la cuenta.
   */
  attempt(ip: string, now = Date.now()): boolean {
    if (this.blocked(ip, now)) return false;
    this.sweep(now);
    this.fail(ip, now);
    return true;
  }

  fail(ip: string, now = Date.now()): void {
    const prev = this.fails.get(ip);
    const expired = prev && prev.count >= this.max && prev.until <= now;
    const count = expired ? 1 : (prev?.count ?? 0) + 1;
    this.fails.set(ip, { count, until: count >= this.max ? now + this.lockMs : 0, last: now });
  }

  success(ip: string): void {
    this.fails.delete(ip);
  }
}
