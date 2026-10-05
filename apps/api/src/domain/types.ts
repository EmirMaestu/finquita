import type { Grant, Permission, Role } from "@mostrador/shared";
import type { Db } from "../db/client";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** La base o una transacción abierta. */
export type DbOrTx = Db | Tx;

/** Una operación que no se puede aplicar: va a Avisos con este motivo. */
export class Rejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Rejection";
  }
}

/** Contexto de quién hace una operación (por la app o por sincronización). */
export type OpContext = {
  memberId: string;
  role: Role;
  grant: (perm: Permission) => Grant;
  /** Quién autorizó con su PIN (ya verificado). */
  authorizedBy: string | null;
  /** El autorizador puede autorizar este permiso. */
  canBeAuthorized: (perm: Permission) => boolean;
  deviceId: string | null;
  /** Hora del dispositivo cuando ocurrió. */
  at: Date;
  clockSkew: boolean;
  /** true si viene de la cola sin conexión: lo que ya ocurrió no se rechaza por PIN. */
  offline: boolean;
};

/**
 * Exige un permiso. Con "pin" alcanza el PIN de un encargado o el dueño.
 * Devuelve el grant efectivo ("allow", "approval" u "own").
 */
export function need(ctx: OpContext, perm: Permission, what: string): "allow" | "approval" | "own" {
  const g = ctx.grant(perm);
  if (g === "deny") throw new Rejection(`${what}: no tiene permiso`);
  if (g === "pin") {
    if (ctx.authorizedBy && ctx.canBeAuthorized(perm)) return "allow";
    throw new Rejection(`${what}: falta la autorización con PIN`);
  }
  return g;
}
