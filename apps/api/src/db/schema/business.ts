import { boolean, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, money, ts, updatedAt } from "./common";

/** El negocio (un solo local por instalación). */
export const businesses = pgTable("businesses", {
  id: id(),
  name: text().notNull(),
  address: text(),
  city: text(),
  cuit: text(),
  taxCondition: text().$type<"monotributo" | "responsable_inscripto">(),
  hours: text(),
  logoUrl: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Ajustes clave/valor (Ajustes > cada sección). */
export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: updatedAt(),
});

export type Role = "owner" | "manager" | "cashier" | "stocker";

/** Personas del equipo. Dueño y encargado además tienen cuenta (Better Auth). */
export const members = pgTable(
  "members",
  {
    id: id(),
    name: text().notNull(),
    nickname: text(),
    role: text().$type<Role>().notNull(),
    email: text(),
    phone: text(),
    authUserId: text(),
    pinHash: text(),
    pinFailedAttempts: integer().notNull().default(0),
    pinLockedUntil: ts("pin_locked_until"),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("members_email_uq").on(t.email),
    uniqueIndex("members_auth_uq").on(t.authUserId),
  ],
);

/** Permisos finos por persona: prenden o apagan lo que da el rol. */
export const memberPermissions = pgTable(
  "member_permissions",
  {
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    permission: text().notNull(),
    /** "allow" | "deny" | "pin" */
    value: text().$type<"allow" | "deny" | "pin">().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("member_permissions_pk").on(t.memberId, t.permission)],
);

/** Puestos de cobro (Caja 1 por defecto). */
export const registers = pgTable("registers", {
  id: id(),
  name: text().notNull(),
  number: integer().notNull(),
  suggestedFloatCents: money("suggested_float_cents").notNull().default(0),
  toleranceCents: money("tolerance_cents").notNull().default(50000),
  active: boolean().notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Dispositivos habilitados por el dueño (se pueden revocar). */
export const devices = pgTable(
  "devices",
  {
    id: id(),
    name: text().notNull(),
    kind: text().$type<"mac" | "iphone" | "tablet" | "other">().notNull().default("other"),
    registerId: uuid().references(() => registers.id),
    tokenHash: text(),
    enabledBy: uuid().references(() => members.id),
    enabledAt: ts("enabled_at"),
    revokedAt: ts("revoked_at"),
    lastSeenAt: ts("last_seen_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("devices_token_uq").on(t.tokenHash)],
);
