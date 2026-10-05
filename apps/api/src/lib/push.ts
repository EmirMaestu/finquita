import webpush from "web-push";
import type { PushSender } from "../domain/checks";

/** Claves VAPID del entorno (sin claves, no hay push: los avisos quedan en la campana). */
export function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT ?? "mailto:dueno@example.com",
  };
}

/** Envío real con web-push. 404 o 410: el navegador ya no existe. */
export function webPushSender(): PushSender | null {
  const k = vapid();
  if (!k) return null;
  webpush.setVapidDetails(k.subject, k.publicKey, k.privateKey);
  return async (sub, msg) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(msg),
        { TTL: 60 * 60 * 12 },
      );
      return "ok";
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      return code === 404 || code === 410 ? "gone" : "error";
    }
  };
}
