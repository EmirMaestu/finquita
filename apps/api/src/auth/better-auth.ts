import { newId } from "@mostrador/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { authAccount, authSession, authUser, authVerification, members } from "../db/schema/index";

export type AuthConfig = { secret: string; baseURL: string; trustedOrigins?: string[] };

export function authConfigFromEnv(): AuthConfig {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("Falta BETTER_AUTH_SECRET");
  }
  return {
    secret: secret ?? "secreto-de-desarrollo-no-usar-en-produccion",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:5173",
  };
}

/**
 * Better Auth para dueño y encargado (email y contraseña, sesiones en Postgres).
 * La primera cuenta es la del dueño; después, solo pueden crear cuenta los invitados.
 */
export function createAuth(db: Db, config: AuthConfig) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    basePath: "/api/auth",
    trustedOrigins: config.trustedOrigins ?? [config.baseURL],
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const [owner] = await db
              .select({ id: members.id })
              .from(members)
              .where(and(eq(members.role, "owner"), eq(members.active, true)))
              .limit(1);
            if (!owner) return { data: user };
            const [invited] = await db
              .select({ id: members.id, role: members.role })
              .from(members)
              .where(
                and(
                  eq(members.email, user.email.toLowerCase()),
                  isNull(members.authUserId),
                  eq(members.active, true),
                ),
              )
              .limit(1);
            if (!invited || (invited.role !== "owner" && invited.role !== "manager")) {
              throw new APIError("FORBIDDEN", {
                message: "Pedile al dueño que te invite desde Ajustes > Usuarios.",
              });
            }
            return { data: user };
          },
          after: async (user) => {
            const email = user.email.toLowerCase();
            const [owner] = await db
              .select({ id: members.id })
              .from(members)
              .where(and(eq(members.role, "owner"), eq(members.active, true)))
              .limit(1);
            if (!owner) {
              await db.insert(members).values({
                id: newId(),
                name: user.name,
                role: "owner",
                email,
                authUserId: user.id,
              });
              return;
            }
            await db
              .update(members)
              .set({ authUserId: user.id })
              .where(and(eq(members.email, email), isNull(members.authUserId)));
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
