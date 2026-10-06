// apps/api/src/admin/session.test.ts
import { describe, expect, it } from "vitest";
import {
  type AdminConfig,
  checkPassword,
  LoginLimiter,
  SESSION_MS,
  signSession,
  verifySession,
} from "./session";

const cfg: AdminConfig = {
  password: "una-contraseña-de-admin-larga",
  secret: "secreto-de-test-con-largo-suficiente-1234",
  origin: "http://localhost:5173",
  backupsDir: "/no-existe",
  version: "test",
  secure: false,
  startedAt: new Date(0),
};

describe("cookie de sesión", () => {
  it("verifica una cookie recién firmada", () => {
    expect(verifySession(cfg, signSession(cfg))).toBe(true);
  });

  it("rechaza una cookie vencida", () => {
    const now = Date.now();
    const v = signSession(cfg, now);
    expect(verifySession(cfg, v, now + SESSION_MS + 1)).toBe(false);
  });

  it("rechaza una cookie adulterada", () => {
    const [exp, sig] = signSession(cfg).split(".");
    expect(verifySession(cfg, `${Number(exp) + 1000}.${sig}`)).toBe(false);
    expect(verifySession(cfg, "basura")).toBe(false);
    expect(verifySession(cfg, `${exp}.${sig}.extra`)).toBe(false);
    expect(verifySession(cfg, undefined)).toBe(false);
  });

  it("cambiar la contraseña invalida las sesiones abiertas", () => {
    const v = signSession(cfg);
    expect(verifySession({ ...cfg, password: "otra-contraseña-de-admin-larga" }, v)).toBe(false);
  });

  it("con el panel apagado no hay sesión válida", () => {
    expect(verifySession({ ...cfg, password: null }, signSession(cfg))).toBe(false);
  });
});

describe("contraseña", () => {
  it("compara la contraseña", () => {
    expect(checkPassword(cfg, "una-contraseña-de-admin-larga")).toBe(true);
    expect(checkPassword(cfg, "una-contraseña-de-admin-larg")).toBe(false);
    expect(checkPassword({ ...cfg, password: null }, "")).toBe(false);
  });
});

describe("bloqueo por intentos", () => {
  it("cinco fallos bloquean 15 minutos y después se puede volver a probar", () => {
    const l = new LoginLimiter();
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) l.fail("1.2.3.4", t);
    expect(l.blocked("1.2.3.4", t)).toBe(false);
    l.fail("1.2.3.4", t);
    expect(l.blocked("1.2.3.4", t)).toBe(true);
    expect(l.blocked("5.6.7.8", t)).toBe(false);
    expect(l.blocked("1.2.3.4", t + 15 * 60_000 + 1)).toBe(false);
  });

  it("un ingreso bueno limpia los fallos", () => {
    const l = new LoginLimiter();
    for (let i = 0; i < 4; i++) l.fail("ip", 0);
    l.success("ip");
    l.fail("ip", 0);
    expect(l.blocked("ip", 0)).toBe(false);
  });
});
