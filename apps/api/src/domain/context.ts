import { canAuthorize, effectiveGrant, type Overrides } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { loadOverrides } from "../auth/permissions";
import type { Db } from "../db/client";
import { members } from "../db/schema/index";
import { type OpContext, Rejection } from "./types";

type Member = typeof members.$inferSelect;

/** Arma el contexto de una operación con la matriz de permisos de quien la hizo. */
export class ContextBuilder {
  private cache = new Map<string, Promise<{ m: Member; o: Overrides } | null>>();
  constructor(private db: Db) {}

  private load(id: string) {
    let p = this.cache.get(id);
    if (!p) {
      p = (async () => {
        const [m] = await this.db.select().from(members).where(eq(members.id, id));
        if (!m) return null;
        return { m, o: await loadOverrides(this.db, id) };
      })();
      this.cache.set(id, p);
    }
    return p;
  }

  async build(a: {
    memberId: string;
    authorizedBy?: string | null;
    deviceId: string | null;
    at: Date;
    clockSkew?: boolean;
    offline?: boolean;
  }): Promise<OpContext> {
    const who = await this.load(a.memberId);
    if (!who?.m.active) throw new Rejection("La persona que hizo la operación no está activa");
    const auth = a.authorizedBy ? await this.load(a.authorizedBy) : null;
    if (a.authorizedBy && !auth?.m.active) throw new Rejection("Quien autorizó no está activo");
    return {
      memberId: who.m.id,
      role: who.m.role,
      grant: (perm) => effectiveGrant(who.m.role, perm, who.o),
      authorizedBy: auth ? auth.m.id : null,
      canBeAuthorized: (perm) => (auth ? canAuthorize(auth.m.role, perm, auth.o) : false),
      deviceId: a.deviceId,
      at: a.at,
      clockSkew: a.clockSkew ?? false,
      offline: a.offline ?? false,
    };
  }
}
