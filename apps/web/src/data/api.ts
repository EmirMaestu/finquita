/** Cliente HTTP de la API: agrega el token del dispositivo y la sesión con PIN. */

import { sessionExpired } from "../app/sessionExpired";

/** Se supo de una sesión (el /api/me respondió): a partir de ahí un 401 es sesión vencida. */
let sessionKnown = false;
export function markSessionKnown(v: boolean) {
  sessionKnown = v;
  if (v) sessionExpired.set(false);
}

/** Errores por campo de un 400 de validación: { "name": "como mucho 60 caracteres" }. */
export function fieldErrorsFrom(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError) || !Array.isArray(e.details)) return {};
  const out: Record<string, string> = {};
  for (const d of e.details as { path?: string; message?: string }[]) {
    if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
  }
  return out;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** No hubo respuesta: sin conexión o el servidor no está. */
export class OfflineError extends Error {
  constructor() {
    super("Sin conexión");
    this.name = "OfflineError";
  }
}

type Credentials = { deviceToken?: string | null; pinToken?: string | null };

const KEYS = { device: "mostrador.deviceToken", pin: "mostrador.pinToken" };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export const credentials = {
  get(): Credentials {
    return { deviceToken: read(KEYS.device), pinToken: read(KEYS.pin) };
  },
  setDevice(token: string | null) {
    try {
      if (token) localStorage.setItem(KEYS.device, token);
      else localStorage.removeItem(KEYS.device);
    } catch {}
  },
  setPin(token: string | null) {
    try {
      if (token) localStorage.setItem(KEYS.pin, token);
      else localStorage.removeItem(KEYS.pin);
    } catch {}
  },
};

export type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Autorización con PIN de quien autoriza: "id:PIN". */
  authorize?: string;
  signal?: AbortSignal;
};

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { deviceToken, pinToken } = credentials.get();
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (deviceToken) headers["x-device-token"] = deviceToken;
  if (pinToken) headers.authorization = `Bearer ${pinToken}`;
  if (opts.authorize) headers["x-authorize"] = opts.authorize;
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new OfflineError();
  }
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  // Entrar (email, PIN equivocado) también responde 401: eso no es una sesión vencida.
  const expired =
    res.status === 401 &&
    Boolean(pinToken || sessionKnown) &&
    !path.startsWith("/api/auth") &&
    !path.startsWith("/api/pin/") &&
    path !== "/api/me";
  if (expired) {
    // Había sesión y ya no: se avisa en pantalla, sin tirar lo que se estaba cargando.
    sessionExpired.set(true);
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    if (res.status >= 502 && res.status <= 504 && !e) throw new OfflineError();
    throw new ApiError(
      res.status,
      e?.code ?? "error",
      // En el formulario se dice qué hacer, no "Iniciá sesión para seguir." (ronda 3).
      expired
        ? "Tu sesión venció: entrá de nuevo y volvé a guardar (lo cargado sigue acá)."
        : (e?.message ?? "Algo salió mal. Probá de nuevo."),
      e?.details,
    );
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Baja un archivo (PDF) con las mismas credenciales que `api`. */
export async function apiBlob(path: string): Promise<Blob> {
  const { deviceToken, pinToken } = credentials.get();
  const headers: Record<string, string> = {};
  if (deviceToken) headers["x-device-token"] = deviceToken;
  if (pinToken) headers.authorization = `Bearer ${pinToken}`;
  let res: Response;
  try {
    res = await fetch(path, { headers, credentials: "same-origin" });
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) throw new ApiError(res.status, "error", "No se pudo bajar el archivo.");
  return res.blob();
}

/** Guarda el archivo en el dispositivo (en iPhone lo abre para compartir). */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await apiBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
