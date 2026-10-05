/** Matriz de permisos (spec § Usuarios y permisos). La API la aplica; la UI solo oculta. */

export type Role = "owner" | "manager" | "cashier" | "stocker";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Dueño",
  manager: "Encargado",
  cashier: "Cajero",
  stocker: "Repositor",
};

/**
 * allow: puede · deny: no puede · pin: pide el PIN de un encargado o del dueño ·
 * approval: lo hace pero queda para aprobar · own: solo lo suyo (su turno).
 */
export type Grant = "allow" | "deny" | "pin" | "approval" | "own";

export type Permission =
  | "sell"
  | "discount"
  | "discount_over_cap"
  | "void_sale"
  | "open_drawer"
  | "shift"
  | "cash_movement"
  | "credit_within_limit"
  | "credit_over_limit"
  | "view_costs"
  | "change_prices"
  | "adjust_stock"
  | "count_receive"
  | "build_orders"
  | "note_shortages"
  | "send_orders"
  | "reports"
  | "reports_profitability"
  | "settings";

type Row = {
  label: string;
  grants: Record<Role, Grant>;
  /** Lo que el dueño puede prender o apagar por persona ("Opcional" en el spec). */
  optional?: Role[];
};

export const PERMISSIONS: Record<Permission, Row> = {
  sell: {
    label: "Vender y cobrar",
    grants: { owner: "allow", manager: "allow", cashier: "allow", stocker: "deny" },
  },
  discount: {
    label: "Descuento hasta el tope configurado",
    grants: { owner: "allow", manager: "allow", cashier: "allow", stocker: "deny" },
  },
  discount_over_cap: {
    label: "Descuento por encima del tope",
    grants: { owner: "allow", manager: "allow", cashier: "pin", stocker: "deny" },
  },
  void_sale: {
    label: "Anular venta o hacer devolución",
    grants: { owner: "allow", manager: "allow", cashier: "pin", stocker: "deny" },
  },
  open_drawer: {
    label: "Abrir el cajón sin venta",
    grants: { owner: "allow", manager: "allow", cashier: "pin", stocker: "deny" },
  },
  shift: {
    label: "Abrir y cerrar su turno de caja",
    grants: { owner: "allow", manager: "allow", cashier: "allow", stocker: "deny" },
  },
  cash_movement: {
    label: "Retiros y gastos de caja",
    grants: { owner: "allow", manager: "allow", cashier: "pin", stocker: "deny" },
  },
  credit_within_limit: {
    label: "Fiado dentro del límite del cliente",
    grants: { owner: "allow", manager: "allow", cashier: "allow", stocker: "deny" },
  },
  credit_over_limit: {
    label: "Fiado por encima del límite o con deuda vencida",
    grants: { owner: "allow", manager: "allow", cashier: "pin", stocker: "deny" },
  },
  view_costs: {
    label: "Ver costos y márgenes",
    grants: { owner: "allow", manager: "deny", cashier: "deny", stocker: "deny" },
    optional: ["manager"],
  },
  change_prices: {
    label: "Cambiar precios",
    grants: { owner: "allow", manager: "allow", cashier: "deny", stocker: "deny" },
  },
  adjust_stock: {
    label: "Ajustar stock (merma, rotura, vencido)",
    grants: { owner: "allow", manager: "allow", cashier: "deny", stocker: "approval" },
  },
  count_receive: {
    label: "Contar stock y recibir mercadería",
    grants: { owner: "allow", manager: "allow", cashier: "deny", stocker: "allow" },
    optional: ["cashier"],
  },
  build_orders: {
    label: "Armar pedidos a proveedores",
    grants: { owner: "allow", manager: "allow", cashier: "deny", stocker: "deny" },
  },
  note_shortages: {
    label: "Anotar faltantes",
    grants: { owner: "allow", manager: "allow", cashier: "allow", stocker: "allow" },
  },
  send_orders: {
    label: "Enviar pedidos por WhatsApp",
    grants: { owner: "allow", manager: "deny", cashier: "deny", stocker: "deny" },
    optional: ["manager"],
  },
  reports: {
    label: "Reportes",
    grants: { owner: "allow", manager: "allow", cashier: "own", stocker: "deny" },
  },
  reports_profitability: {
    label: "Reportes de rentabilidad y resultado",
    grants: { owner: "allow", manager: "deny", cashier: "deny", stocker: "deny" },
  },
  settings: {
    label: "Ajustes y usuarios",
    grants: { owner: "allow", manager: "deny", cashier: "deny", stocker: "deny" },
  },
};

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Ajustes por persona: el dueño prende, apaga o pide PIN. */
export type Overrides = Partial<Record<Permission, "allow" | "deny" | "pin">>;

export function effectiveGrant(role: Role, perm: Permission, overrides: Overrides = {}): Grant {
  if (role === "owner") return "allow";
  // Rentabilidad sigue al permiso de ver costos (el encargado la ve solo con ese permiso).
  if (perm === "reports_profitability") {
    if (role !== "manager") return "deny";
    return effectiveGrant(role, "view_costs", overrides) === "allow" ? "allow" : "deny";
  }
  const o = overrides[perm];
  if (o) return o;
  return PERMISSIONS[perm].grants[role];
}

export function effectiveGrants(role: Role, overrides: Overrides = {}): Record<Permission, Grant> {
  return Object.fromEntries(
    ALL_PERMISSIONS.map((p) => [p, effectiveGrant(role, p, overrides)]),
  ) as Record<Permission, Grant>;
}

/** "Lo puede hacer: Dueño o Encargado." (para el estado sin permiso). */
export function whoCan(perm: Permission): string {
  const roles = (Object.keys(ROLE_LABEL) as Role[]).filter(
    (r) => PERMISSIONS[perm].grants[r] === "allow",
  );
  const names = roles.map((r) => ROLE_LABEL[r]);
  if (names.length <= 1) return names[0] ?? "Dueño";
  return `${names.slice(0, -1).join(", ")} o ${names.at(-1)}`;
}

/** Quién puede autorizar con su PIN una acción marcada PIN. */
export function canAuthorize(role: Role, perm: Permission, overrides: Overrides = {}): boolean {
  return (
    (role === "owner" || role === "manager") && effectiveGrant(role, perm, overrides) === "allow"
  );
}
