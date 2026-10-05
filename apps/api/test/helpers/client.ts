import type { Hono } from "hono";

export const ORIGIN = "http://localhost:5173";
export const TEST_AUTH = { secret: "secreto-de-test-con-largo-suficiente-1234", baseURL: ORIGIN };

type Json = Record<string, unknown> | unknown[];

/** Cliente de pruebas que guarda cookies y los tokens de dispositivo y PIN. */
export class TestClient {
  cookies = new Map<string, string>();
  deviceToken?: string;
  pinToken?: string;

  // biome-ignore lint/suspicious/noExplicitAny: cualquier app de Hono
  constructor(private app: Hono<any>) {}

  async request(method: string, path: string, body?: Json, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { origin: ORIGIN, ...headers };
    if (body !== undefined) h["content-type"] = "application/json";
    if (this.cookies.size) {
      h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    if (this.deviceToken) h["x-device-token"] = this.deviceToken;
    if (this.pinToken) h.authorization = `Bearer ${this.pinToken}`;
    const res = await this.app.request(`http://localhost${path}`, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const [k, ...v] = (pair ?? "").split("=");
      if (k) this.cookies.set(k.trim(), v.join("="));
    }
    const text = await res.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {}
    // biome-ignore lint/suspicious/noExplicitAny: comodidad en los tests
    return { status: res.status, body: data as any };
  }

  get(path: string) {
    return this.request("GET", path);
  }
  post(path: string, body?: Json) {
    return this.request("POST", path, body ?? {});
  }
  put(path: string, body?: Json) {
    return this.request("PUT", path, body ?? {});
  }
  patch(path: string, body?: Json) {
    return this.request("PATCH", path, body ?? {});
  }
  delete(path: string) {
    return this.request("DELETE", path);
  }

  signUp(email: string, password: string, name: string) {
    return this.post("/api/auth/sign-up/email", { email, password, name });
  }
  signIn(email: string, password: string) {
    return this.post("/api/auth/sign-in/email", { email, password });
  }
}
