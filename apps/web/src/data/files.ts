import { newId } from "@mostrador/shared";
import { credentials } from "./api";
import { localDb } from "./db";

/** Achica una foto en el dispositivo: lado mayor de 1024 px, JPEG. */
export async function shrinkPhoto(file: Blob, max = 1024): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    return out ?? file;
  } catch {
    return file;
  }
}

async function upload(id: string, blob: Blob, type: string): Promise<boolean> {
  const { deviceToken, pinToken } = credentials.get();
  const headers: Record<string, string> = { "content-type": type };
  if (deviceToken) headers["x-device-token"] = deviceToken;
  if (pinToken) headers.authorization = `Bearer ${pinToken}`;
  try {
    const res = await fetch(`/api/files/${id}`, { method: "PUT", headers, body: blob, credentials: "same-origin" });
    // 4xx que no se arregla reintentando: se descarta.
    return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408);
  } catch {
    return false;
  }
}

/**
 * Guarda la foto para subirla (ya o cuando vuelva la conexión) y devuelve su id.
 * El id lo genera el dispositivo, así la operación que la nombra puede viajar antes.
 */
export async function queuePhoto(file: Blob): Promise<string> {
  const blob = await shrinkPhoto(file);
  const id = newId();
  const type = blob.type || "image/jpeg";
  await localDb().files.put({ id, blob, type, createdAt: new Date().toISOString() });
  void uploadPendingFiles();
  return id;
}

let running: Promise<void> | null = null;

/** Sube las fotos pendientes. */
export function uploadPendingFiles(): Promise<void> {
  running ??= (async () => {
    try {
      for (const f of await localDb().files.toArray()) {
        if (await upload(f.id, f.blob, f.type)) await localDb().files.delete(f.id);
        else break;
      }
    } finally {
      running = null;
    }
  })();
  return running;
}
