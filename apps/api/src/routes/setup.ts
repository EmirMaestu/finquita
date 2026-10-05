import { newId } from "@mostrador/shared";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { AppEnv } from "../app";
import { requireActor } from "../auth/actor";
import { requireFull } from "../auth/permissions";
import {
  businesses,
  members,
  products,
  registers,
  sales,
  settings,
  shifts,
  suppliers,
} from "../db/schema/index";
import { auditFrom } from "../lib/audit";
import { conflict } from "../lib/errors";
import { validate } from "../lib/validate";

export const setupRoutes = new Hono<AppEnv>();

const count = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

/** Primeros pasos: qué falta para arrancar (la checklist de Inicio, con barra de progreso). */
setupRoutes.get("/setup/status", requireActor(), requireFull("settings"), async (c) => {
  const db = c.get("db");
  const n = sql<number>`count(*)::int`;
  const [business] = await db.select().from(businesses).limit(1);
  const [pay] = await db.select().from(settings).where(eq(settings.key, "payments"));
  const [onb] = await db.select().from(settings).where(eq(settings.key, "onboarding"));
  const steps = [
    {
      key: "business",
      done: !!business,
      title: "Cargá los datos del negocio",
      action: "Negocio",
      path: "/ajustes/negocio",
    },
    {
      key: "products",
      done: (await count(db.select({ n }).from(products).where(isNull(products.deletedAt)))) > 0,
      title: "Cargá tus productos",
      detail: "Con Excel, escaneando en Modo carga o directamente vendiendo",
      action: "Modo carga",
      path: "/productos/carga",
    },
    {
      key: "payments",
      done: !!pay,
      title: "Configurá medios de pago",
      detail: "Recargos, alias y CVU para transferencias",
      action: "Medios de pago",
      path: "/ajustes/medios",
    },
    {
      key: "team",
      done: (await count(db.select({ n }).from(members).where(eq(members.active, true)))) > 1,
      title: "Sumá a tu equipo",
      detail: "Invitá a cada persona y asignale su PIN",
      action: "Usuarios",
      path: "/ajustes/usuarios",
    },
    {
      key: "suppliers",
      done: (await count(db.select({ n }).from(suppliers).where(isNull(suppliers.deletedAt)))) > 0,
      title: "Agregá a tus proveedores",
      action: "Proveedores",
      path: "/compras/proveedores",
    },
    {
      key: "whatsapp",
      done:
        (await count(
          db
            .select({ n })
            .from(suppliers)
            .where(and(isNull(suppliers.deletedAt), isNotNull(suppliers.whatsapp))),
        )) > 0,
      title: "Cargá el WhatsApp de tus proveedores",
      detail: "Los pedidos salen con un botón que abre el chat",
      action: "Proveedores",
      path: "/compras/proveedores",
    },
    {
      key: "first_shift",
      done: (await count(db.select({ n }).from(shifts))) > 0,
      title: "Abrí la primera caja",
      action: "Abrir caja",
      path: "/caja",
    },
  ];
  const hasSales = (await count(db.select({ n }).from(sales))) > 0;
  return c.json({
    steps,
    done: steps.filter((s) => s.done).length,
    total: steps.length,
    hasSales,
    dismissed: (onb?.value as { dismissed?: boolean } | undefined)?.dismissed === true,
  });
});

const businessBody = z.object({
  name: z.string().min(1, "Poné el nombre del negocio").max(80),
  address: z.string().max(120).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
});

/** Primer uso: datos del negocio y la Caja 1. Solo si todavía no hay negocio. */
setupRoutes.post(
  "/setup/business",
  requireActor(),
  requireFull("settings"),
  validate("json", businessBody),
  async (c) => {
    const db = c.get("db");
    const b = c.req.valid("json");
    const id = await db.transaction(async (tx) => {
      const [exists] = await tx.select({ id: businesses.id }).from(businesses).limit(1);
      if (exists) throw conflict("El negocio ya está cargado: cambialo desde Ajustes.");
      const id = newId();
      await tx
        .insert(businesses)
        .values({ id, name: b.name.trim(), address: b.address ?? null, city: b.city ?? null });
      const [reg] = await tx.select({ id: registers.id }).from(registers).limit(1);
      if (!reg)
        await tx.insert(registers).values({
          id: newId(),
          name: "Caja 1",
          number: 1,
          suggestedFloatCents: 2_000_000,
          toleranceCents: 50_000,
        });
      return id;
    });
    await auditFrom(c, db, {
      action: "business.created",
      entityType: "business",
      entityId: id,
      after: b,
    });
    return c.json({ id }, 201);
  },
);

/** Ocultar la checklist (el panel la reemplaza igual con la primera venta). */
setupRoutes.post("/setup/dismiss", requireActor(), requireFull("settings"), async (c) => {
  await c
    .get("db")
    .insert(settings)
    .values({ key: "onboarding", value: { dismissed: true } })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { dismissed: true }, updatedAt: new Date() },
    });
  return c.json({ ok: true });
});
