import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Hono } from "hono";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";
import { ApiError, notFound } from "../lib/errors";

/** Fotos de remitos, comprobantes y productos. Se achican en el dispositivo antes de subir. */
export const fileRoutes = new Hono<AppEnv>();

const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX = 5 * 1024 * 1024;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const filesDir = () => resolve(process.env.FILES_DIR ?? "data/files");

/** PUT idempotente: el id lo genera el dispositivo (la foto puede subirse después, al volver la conexión). */
fileRoutes.put("/files/:id", requireActor(), async (c) => {
  const id = c.req.param("id");
  if (!ID.test(id)) throw new ApiError(400, "invalid_id", "El id del archivo no es válido.");
  const type = (c.req.header("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const ext = TYPES[type];
  if (!ext) throw new ApiError(415, "unsupported_type", "Solo fotos (JPG, PNG o WebP) o PDF.");
  const body = new Uint8Array(await c.req.arrayBuffer());
  if (!body.length) throw new ApiError(400, "empty", "El archivo está vacío.");
  if (body.length > MAX) throw new ApiError(413, "too_large", "El archivo pesa más de 5 MB.");
  const dir = filesDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}.${ext}`), body);
  return c.json({ id, url: `/api/files/${id}` });
});

fileRoutes.get("/files/:id", requireActor(), async (c) => {
  const id = c.req.param("id");
  if (!ID.test(id)) throw notFound("Ese archivo no existe.");
  const dir = filesDir();
  const name = (await readdir(dir).catch(() => [] as string[])).find((f) => f.startsWith(`${id}.`));
  if (!name) throw notFound("Ese archivo no existe.");
  const ext = name.split(".").pop() ?? "";
  const type = Object.entries(TYPES).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  const data = await readFile(join(dir, name));
  return c.body(data as unknown as ArrayBuffer, 200, {
    "content-type": type,
    "cache-control": "private, max-age=31536000, immutable",
  });
});
