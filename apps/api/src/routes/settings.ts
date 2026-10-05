import {
  ALERT_KINDS,
  ALL_PERMISSIONS,
  DEFAULT_SETTINGS,
  effectiveGrant,
  newId,
  PERMISSIONS,
  type Permission,
  type SettingsMap,
  writeCsv,
} from "@mostrador/shared";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";
import { requireFull } from "../auth/permissions";
import { hashPin } from "../auth/pin";
import {
  barcodes,
  businesses,
  categories,
  customers,
  memberPermissions,
  members,
  products,
  registers,
  settings,
  suppliers,
} from "../db/schema/index";
import { auditFrom, diff } from "../lib/audit";
import { ApiError, conflict, notFound } from "../lib/errors";
import { validate } from "../lib/validate";

export const settingsRoutes = new Hono<AppEnv>();
const owner = requireFull("settings");

const roles = z.enum(["owner", "manager", "cashier", "stocker"]);
const methodPatch = z
  .object({
    enabled: z.boolean(),
    surchargeBp: z.number().int().min(-5000).max(5000),
    feeBp: z.number().int().min(0).max(2000),
  })
  .partial();

/** Lo que se puede cambiar en cada sección (siempre parcial: se mezcla con lo guardado). */
const SCHEMAS = {
  features: z
    .object({
      promotions: z.boolean(),
      lots: z.boolean(),
      counts: z.boolean(),
      multiRegister: z.boolean(),
    })
    .partial(),
  pricing: z
    .object({
      roundingCents: z.union([z.literal(100), z.literal(1000), z.literal(5000), z.literal(10000)]),
      defaultMarginBp: z.number().int().min(0).max(50000),
      minMarginBp: z.number().int().min(0).max(50000),
      discountCapBp: z.number().int().min(0).max(10000),
      sellWithoutStock: z.enum(["warn", "pin"]),
      reserveDays: z.number().int().min(0).max(30),
    })
    .partial(),
  payments: z
    .object({
      methods: z
        .object({
          cash: methodPatch,
          debit: methodPatch,
          credit: methodPatch,
          transfer: methodPatch,
          qr: methodPatch,
          account: methodPatch,
        })
        .partial(),
      alias: z.string().max(60),
      cvu: z.string().regex(/^\d{0,22}$/, "El CVU tiene 22 números"),
      qrImage: z.string().max(400_000).startsWith("data:image/").nullable(),
    })
    .partial(),
  tickets: z
    .object({
      printer: z.boolean(),
      width: z.union([z.literal(58), z.literal(80)]),
      header: z.string().max(200),
      footer: z.string().max(200),
      autoPrint: z.boolean(),
      copies: z.number().int().min(1).max(3),
    })
    .partial(),
  alerts: z.partialRecord(
    z.enum(ALERT_KINDS),
    z.object({ app: z.array(roles), push: z.array(roles) }),
  ),
  cash: z
    .object({
      blindCount: z.boolean(),
      denominations: z.array(z.number().int().positive().max(100_000)).min(1).max(20),
    })
    .partial(),
  invoicing: z.object({ notifyWhenReady: z.boolean() }).partial(),
} satisfies Record<keyof SettingsMap, z.ZodType>;

type Key = keyof typeof SCHEMAS;

function merge<T>(base: T, patch: unknown): T {
  if (
    !patch ||
    typeof patch !== "object" ||
    Array.isArray(patch) ||
    !base ||
    typeof base !== "object" ||
    Array.isArray(base)
  )
    return (patch ?? base) as T;
  const out = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) out[k] = merge(out[k], v);
  return out as T;
}

async function current(db: AppEnv["Variables"]["db"]): Promise<SettingsMap> {
  const rows = await db.select().from(settings);
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows)
    if (r.key in out)
      (out as Record<string, unknown>)[r.key] = merge(
        (out as Record<string, unknown>)[r.key],
        r.value,
      );
  return out;
}

/** Todas las secciones, con los valores por defecto para lo que falte. */
settingsRoutes.get("/settings", requireActor(), owner, async (c) =>
  c.json(await current(c.get("db"))),
);

/** Cambiar una sección. Los cambios quedan en Actividad. */
settingsRoutes.put("/settings/:key", requireActor(), owner, async (c) => {
  const key = c.req.param("key") as Key;
  const schema = SCHEMAS[key];
  if (!schema) throw notFound("Esa sección no existe.");
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    throw new ApiError(
      400,
      "validation",
      parsed.error.issues[0]?.message ?? "Revisá los datos.",
      parsed.error.issues,
    );
  const db = c.get("db");
  const before = (await current(db))[key];
  const after = merge(before, parsed.data);
  if (
    key === "payments" &&
    !Object.values((after as SettingsMap["payments"]).methods).some((m) => m.enabled)
  ) {
    throw conflict("Dejá al menos un medio de pago activo.");
  }
  await db
    .insert(settings)
    .values({ key, value: after })
    .onConflictDoUpdate({ target: settings.key, set: { value: after, updatedAt: new Date() } });
  await auditFrom(c, db, {
    action: `settings.${key}`,
    entityType: "settings",
    entityId: key,
    ...diff(before as never, after as never),
  });
  return c.json(after);
});

// ── Negocio ─────────────────────────────────────────────────────────────────

const businessBody = z
  .object({
    name: z.string().min(1).max(80),
    address: z.string().max(120).nullable(),
    city: z.string().max(80).nullable(),
    cuit: z
      .string()
      .regex(/^\d{2}-?\d{8}-?\d$/, "El CUIT tiene 11 números: 20-12345678-9")
      .nullable(),
    taxCondition: z.enum(["monotributo", "responsable_inscripto"]).nullable(),
    hours: z.string().max(120).nullable(),
    logoUrl: z.string().max(400_000).nullable(),
  })
  .partial();

settingsRoutes.get("/business", requireActor(), async (c) => {
  const [b] = await c.get("db").select().from(businesses).limit(1);
  return c.json(b ?? null);
});

settingsRoutes.patch(
  "/business",
  requireActor(),
  owner,
  validate("json", businessBody),
  async (c) => {
    const db = c.get("db");
    const [b] = await db.select().from(businesses).limit(1);
    if (!b) throw notFound("Todavía no hay negocio cargado.");
    const [after] = await db
      .update(businesses)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(businesses.id, b.id))
      .returning();
    await auditFrom(c, db, {
      action: "business.updated",
      entityType: "business",
      entityId: b.id,
      ...diff(b as never, after as never),
    });
    return c.json(after);
  },
);

// ── Usuarios ────────────────────────────────────────────────────────────────

settingsRoutes.get("/members", requireActor(), owner, async (c) => {
  const db = c.get("db");
  const rows = await db.select().from(members).orderBy(asc(members.name));
  const overrides = await db.select().from(memberPermissions);
  return c.json(
    rows.map((m) => ({
      id: m.id,
      name: m.name,
      nickname: m.nickname,
      role: m.role,
      email: m.email,
      phone: m.phone,
      active: m.active,
      hasPin: !!m.pinHash,
      hasAccount: !!m.authUserId,
      overrides: Object.fromEntries(
        overrides.filter((o) => o.memberId === m.id).map((o) => [o.permission, o.value]),
      ),
    })),
  );
});

const PIN_RE = /^\d{4,6}$/;
const memberBody = z.object({
  name: z.string().min(1).max(60),
  nickname: z.string().max(30).nullable().optional(),
  role: roles,
  email: z.email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  pin: z.string().regex(PIN_RE, "El PIN tiene que tener de 4 a 6 números").optional(),
});

/** Invitar: el dueño carga a la persona; si es encargado (o dueño) con email, crea su cuenta desde el ingreso. */
settingsRoutes.post("/members", requireActor(), owner, validate("json", memberBody), async (c) => {
  const b = c.req.valid("json");
  const db = c.get("db");
  if ((b.role === "owner" || b.role === "manager") && !b.email)
    throw new ApiError(
      400,
      "validation",
      "El encargado entra con su email: cargalo para invitarlo.",
    );
  if (b.email) {
    const [dup] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.email, b.email.toLowerCase()));
    if (dup) throw conflict("Ya hay alguien con ese email.");
  }
  const id = newId();
  await db.insert(members).values({
    id,
    name: b.name,
    nickname: b.nickname ?? null,
    role: b.role,
    email: b.email?.toLowerCase() ?? null,
    phone: b.phone ?? null,
    pinHash: b.pin ? await hashPin(b.pin) : null,
  });
  await auditFrom(c, db, {
    action: "member.invited",
    entityType: "member",
    entityId: id,
    after: { name: b.name, role: b.role, email: b.email ?? null },
  });
  return c.json({ id }, 201);
});

settingsRoutes.patch(
  "/members/:id",
  requireActor(),
  owner,
  validate(
    "json",
    memberBody.omit({ pin: true }).partial().extend({ active: z.boolean().optional() }),
  ),
  async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const b = c.req.valid("json");
    const [before] = await db.select().from(members).where(eq(members.id, id));
    if (!before) throw notFound("No encontramos a esa persona.");
    // Siempre queda un dueño activo.
    if (before.role === "owner" && (b.active === false || (b.role && b.role !== "owner"))) {
      const owners = await db
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.role, "owner"), eq(members.active, true)));
      if (owners.length <= 1) throw conflict("Tiene que quedar al menos un dueño activo.");
    }
    const [after] = await db
      .update(members)
      .set({
        ...b,
        ...(b.email !== undefined ? { email: b.email?.toLowerCase() ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(members.id, id))
      .returning();
    await auditFrom(c, db, {
      action: b.active === false ? "member.deactivated" : "member.updated",
      entityType: "member",
      entityId: id,
      ...diff(
        { name: before.name, role: before.role, active: before.active, email: before.email },
        { name: after?.name, role: after?.role, active: after?.active, email: after?.email },
      ),
    });
    return c.json({ ok: true });
  },
);

const permsBody = z.partialRecord(
  z.enum(ALL_PERMISSIONS as [Permission, ...Permission[]]),
  z.enum(["allow", "deny", "pin"]).nullable(),
);

/** Permisos finos: prenden o apagan lo que da el rol (null vuelve a lo del rol). */
settingsRoutes.put(
  "/members/:id/permissions",
  requireActor(),
  owner,
  validate("json", permsBody),
  async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const [m] = await db.select().from(members).where(eq(members.id, id));
    if (!m) throw notFound("No encontramos a esa persona.");
    const b = c.req.valid("json");
    const before = Object.fromEntries(
      (await db.select().from(memberPermissions).where(eq(memberPermissions.memberId, id))).map(
        (o) => [o.permission, o.value],
      ),
    );
    for (const [perm, value] of Object.entries(b) as [
      Permission,
      "allow" | "deny" | "pin" | null,
    ][]) {
      const optional = PERMISSIONS[perm].optional ?? [];
      if (value && !optional.includes(m.role) && value !== effectiveGrant(m.role, perm, {})) {
        throw new ApiError(
          400,
          "not_optional",
          `"${PERMISSIONS[perm].label}" no se puede cambiar para este rol.`,
        );
      }
      if (value === null)
        await db
          .delete(memberPermissions)
          .where(and(eq(memberPermissions.memberId, id), eq(memberPermissions.permission, perm)));
      else
        await db
          .insert(memberPermissions)
          .values({ memberId: id, permission: perm, value })
          .onConflictDoUpdate({
            target: [memberPermissions.memberId, memberPermissions.permission],
            set: { value, updatedAt: new Date() },
          });
    }
    await auditFrom(c, db, {
      action: "member.permissions",
      entityType: "member",
      entityId: id,
      before,
      after: b,
    });
    return c.json({ ok: true });
  },
);

// ── Cajas ───────────────────────────────────────────────────────────────────

const registerBody = z
  .object({
    name: z.string().min(1).max(40),
    suggestedFloatCents: z.number().int().min(0),
    toleranceCents: z.number().int().min(0),
    active: z.boolean(),
  })
  .partial();

settingsRoutes.post(
  "/registers",
  requireActor(),
  owner,
  validate("json", registerBody.required({ name: true })),
  async (c) => {
    const db = c.get("db");
    const [{ n } = { n: 0 }] = await db.select({ n: max(registers.number) }).from(registers);
    const id = newId();
    await db.insert(registers).values({ id, number: (n ?? 0) + 1, ...c.req.valid("json") });
    await auditFrom(c, db, {
      action: "register.created",
      entityType: "register",
      entityId: id,
      after: c.req.valid("json"),
    });
    return c.json({ id }, 201);
  },
);

settingsRoutes.patch(
  "/registers/:id",
  requireActor(),
  owner,
  validate("json", registerBody),
  async (c) => {
    const id = c.req.param("id");
    const db = c.get("db");
    const [before] = await db.select().from(registers).where(eq(registers.id, id));
    if (!before) throw notFound("Esa caja no existe.");
    const [after] = await db
      .update(registers)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(registers.id, id))
      .returning();
    await auditFrom(c, db, {
      action: "register.updated",
      entityType: "register",
      entityId: id,
      ...diff(before as never, after as never),
    });
    return c.json(after);
  },
);

// ── Datos: exportar ────────────────────────────────────────────────────────

/** Exportar productos, clientes o proveedores a CSV (se abre con Excel). */
settingsRoutes.get("/export/:entity", requireActor(), owner, async (c) => {
  const entity = c.req.param("entity");
  const db = c.get("db");
  let rows: (string | number | null)[][];
  if (entity === "products.csv") {
    const ps = await db
      .select()
      .from(products)
      .where(isNull(products.deletedAt))
      .orderBy(asc(products.name));
    const codes = await db.select().from(barcodes);
    const cats = await db.select().from(categories);
    rows = [
      [
        "nombre",
        "codigo",
        "codigo_interno",
        "categoria",
        "costo",
        "precio",
        "stock",
        "minimo",
        "unidad",
      ],
    ];
    for (const p of ps)
      rows.push([
        p.name,
        codes.find((b) => b.productId === p.id)?.code ?? "",
        p.internalCode ?? "",
        cats.find((x) => x.id === p.categoryId)?.name ?? "",
        p.costCents != null ? p.costCents / 100 : null,
        p.priceCents / 100,
        p.stockQty,
        p.minStock ?? null,
        p.saleUnit,
      ]);
  } else if (entity === "customers.csv") {
    const cs = await db
      .select()
      .from(customers)
      .where(isNull(customers.deletedAt))
      .orderBy(asc(customers.name));
    rows = [["nombre", "apodo", "telefono", "direccion", "dni", "limite", "saldo"]];
    for (const x of cs)
      rows.push([
        x.name,
        x.nickname,
        x.phone,
        x.address,
        x.dni,
        x.creditLimitCents / 100,
        x.balanceCents / 100,
      ]);
  } else if (entity === "suppliers.csv") {
    const ss = await db
      .select()
      .from(suppliers)
      .where(isNull(suppliers.deletedAt))
      .orderBy(asc(suppliers.name));
    rows = [["nombre", "rubro", "contacto", "whatsapp", "email", "cuit"]];
    for (const s of ss) rows.push([s.name, s.category, s.contactName, s.whatsapp, s.email, s.cuit]);
  } else throw notFound("No se puede exportar eso.");

  return c.body(writeCsv(rows), 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${entity}"`,
  });
});
