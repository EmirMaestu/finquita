import { api } from "./data/api";

/** Clave VAPID de base64url a bytes (lo que pide pushManager.subscribe). */
function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** En el iPhone, el push solo anda con la app agregada a la pantalla de inicio. */
function isIosBrowser(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

export async function pushState(): Promise<PushState> {
  if (typeof window !== "undefined" && isIosBrowser()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** Pide permiso, se suscribe con la clave del servidor y guarda la suscripción. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const { publicKey } = await api<{ publicKey: string | null }>("/api/push/key");
  if (!publicKey)
    throw new Error("El servidor todavía no tiene las claves de notificaciones (VAPID).");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey) as BufferSource,
    }));
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  await api("/api/push/subscriptions", { body: { endpoint: json.endpoint, keys: json.keys } });
  return "on";
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api("/api/push/subscriptions", {
      method: "DELETE",
      body: { endpoint: sub.endpoint },
    }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return "off";
}
