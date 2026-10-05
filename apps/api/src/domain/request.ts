import type { Context } from "hono";
import type { AppEnv } from "../app";
import { actorOf } from "../auth/actor";
import { ApiError } from "../lib/errors";
import { ContextBuilder } from "./context";
import { type OpContext, Rejection } from "./types";

/** Contexto de dominio para un pedido online (no viene de la cola sin conexión). */
export async function requestContext(
  c: Context<AppEnv>,
  authorizedBy: string | null = null,
): Promise<OpContext> {
  const actor = actorOf(c);
  let authz: string | null = authorizedBy;
  try {
    authz ??= c.get("authz")?.authorizedBy ?? null;
  } catch {}
  return new ContextBuilder(c.get("db")).build({
    memberId: actor.member.id,
    authorizedBy: authz,
    deviceId: actor.device?.id ?? null,
    at: new Date(),
    offline: false,
  });
}

/** Un rechazo del dominio, contado como error de la API (400 con el motivo, o 403 si es permiso). */
export function asApiError(err: unknown): unknown {
  if (!(err instanceof Rejection)) return err;
  if (/permiso/.test(err.message)) return new ApiError(403, "forbidden", `${err.message}.`);
  if (/PIN/.test(err.message)) return new ApiError(403, "pin_required", "Autorizá con tu PIN.");
  return new ApiError(400, "rejected", err.message);
}

/** Corre un servicio de dominio en una transacción y traduce los rechazos. */
export async function runDomain<T>(
  c: Context<AppEnv>,
  fn: (
    tx: Parameters<Parameters<AppEnv["Variables"]["db"]["transaction"]>[0]>[0],
    ctx: OpContext,
  ) => Promise<T>,
  authorizedBy: string | null = null,
): Promise<T> {
  const ctx = await requestContext(c, authorizedBy).catch((e) => {
    throw asApiError(e);
  });
  try {
    return await c.get("db").transaction((tx) => fn(tx, ctx));
  } catch (err) {
    throw asApiError(err);
  }
}
