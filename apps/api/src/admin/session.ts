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
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) <= now) return false;
  return safeEqual(sig, sign(cfg, exp));
}

export function checkPassword(cfg: AdminConfig, input: string): boolean {
  return cfg.password !== null && safeEqual(input, cfg.password);
}

/** Cinco intentos fallidos desde una IP la bloquean 15 minutos (en memoria: una sola API). */
export class LoginLimiter {
  private fails = new Map<string, { count: number; until: number }>();

  constructor(
    private max = 5,
    private lockMs = 15 * 60_000,
  ) {}

  blocked(ip: string, now = Date.now()): boolean {
    const f = this.fails.get(ip);
    return !!f && f.until > now;
  }

  fail(ip: string, now = Date.now()): void {
    const prev = this.fails.get(ip);
    const expired = prev && prev.count >= this.max && prev.until <= now;
    const count = expired ? 1 : (prev?.count ?? 0) + 1;
    this.fails.set(ip, { count, until: count >= this.max ? now + this.lockMs : 0 });
  }

  success(ip: string): void {
    this.fails.delete(ip);
  }
}
