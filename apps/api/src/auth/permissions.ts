import {
  canAuthorize,
  effectiveGrant,
  type Grant,
  type Overrides,
  PERMISSIONS,
  type Permission,
  whoCan,
} from "@mostrador/shared";
import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../app";
import type { Db } from "../db/client";
import { memberPermissions, members } from "../db/schema/index";
import { ApiError, forbidden } from "../lib/errors";
import { actorOf } from "./actor";
import { verifyMemberPin } from "./pin";

export const AUTHORIZE_HEADER = "x-authorize";

export async function loadOverrides(db: Db, memberId: string): Promise<Overrides> {
  const rows = await db
    .select()
    .from(memberPermissions)
    .where(eq(memberPermissions.memberId, memberId));
  return Object.fromEntries(rows.map((r) => [r.permission, r.value])) as Overrides;
}

export type Authorization = {
  grant: Exclude<Grant, "deny" | "pin">;
  /** Quién autorizó con su PIN, si hizo falta. */
  authorizedBy: string | null;
};

/**
 * Aplica la matriz para el actor del pedido. Si la acción pide PIN, lo busca en la
 * cabecera `x-authorize: <id de quien autoriza>:<PIN>`; si falta, responde `pin_required`
 * para que la app abra el teclado "Autorizá con tu PIN".
 */
export async function authorize(c: Context<AppEnv>, perm: Permission): Promise<Authorization> {
  const actor = actorOf(c);
  const db = c.get("db");
  const grant = effectiveGrant(actor.member.role, perm, await loadOverrides(db, actor.member.id));
  if (grant === "deny") {
    throw forbidden(`No tenés permiso para esto. Lo puede hacer: ${whoCan(perm)}.`, {
      permission: perm,
      whoCan: whoCan(perm),
    });
  }
  if (grant !== "pin") return { grant, authorizedBy: null };

  const header = c.req.header(AUTHORIZE_HEADER);
  const [authorizerId, pin] = header?.split(":") ?? [];
  if (!authorizerId || !pin) {
    throw new ApiError(403, "pin_required", "Autorizá con tu PIN.", {
      permission: perm,
      label: PERMISSIONS[perm].label,
    });
  }
  const [authorizer] = await db.select().from(members).where(eq(members.id, authorizerId));
  if (!authorizer || !canAuthorize(authorizer.role, perm, await loadOverrides(db, authorizer.id))) {
    throw new ApiError(
      403,
      "pin_not_allowed",
      "Ese PIN no puede autorizar esto. Pedíselo a un encargado o al dueño.",
    );
  }
  const r = await verifyMemberPin(db, authorizer.id, pin);
  if (!r.ok) {
    if (r.reason === "locked") {
      throw new ApiError(
        423,
        "pin_locked",
        "Demasiados intentos con ese PIN. Esperá cinco minutos.",
      );
    }
    throw new ApiError(403, "pin_wrong", "El PIN no es correcto.", {
      attemptsLeft: r.reason === "wrong" ? r.attemptsLeft : undefined,
    });
  }
  return { grant: "allow", authorizedBy: authorizer.id };
}

/** Middleware: exige el permiso y deja el resultado en `c.var.authz`. */
export function requirePermission(perm: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set("authz", await authorize(c, perm));
    await next();
  };
}
