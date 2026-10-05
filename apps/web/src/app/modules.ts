import {
  ChartColumn,
  Ellipsis,
  HandCoins,
  House,
  type LucideIcon,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";

export type ModuleId =
  | "inicio"
  | "vender"
  | "caja"
  | "productos"
  | "compras"
  | "clientes"
  | "reportes"
  | "ajustes";

export type ModuleDef = {
  id: ModuleId;
  label: string;
  path: string;
  icon: LucideIcon;
  group: "Mostrador" | "Mercadería" | "Gestión";
};

/** Ocho módulos de v1 (WhatsApp es fase 2), en tres grupos. */
export const MODULES: ModuleDef[] = [
  { id: "inicio", label: "Inicio", path: "/inicio", icon: House, group: "Mostrador" },
  { id: "vender", label: "Vender", path: "/vender", icon: ShoppingCart, group: "Mostrador" },
  { id: "caja", label: "Caja", path: "/caja", icon: Wallet, group: "Mostrador" },
  { id: "productos", label: "Productos", path: "/productos", icon: Package, group: "Mercadería" },
  { id: "compras", label: "Compras", path: "/compras", icon: Truck, group: "Mercadería" },
  {
    id: "clientes",
    label: "Clientes y fiado",
    path: "/clientes",
    icon: HandCoins,
    group: "Gestión",
  },
  { id: "reportes", label: "Reportes", path: "/reportes", icon: ChartColumn, group: "Gestión" },
  { id: "ajustes", label: "Ajustes", path: "/ajustes", icon: Settings, group: "Gestión" },
];

export const GROUPS = ["Mostrador", "Mercadería", "Gestión"] as const;

/** Barra inferior del celular: cuatro módulos y Más. */
export const BOTTOM_BAR: ModuleId[] = ["inicio", "vender", "productos", "compras"];
export const MORE_ITEM = { label: "Más", path: "/mas", icon: Ellipsis };

export function moduleForPath(pathname: string): ModuleDef | undefined {
  return MODULES.find((m) => pathname === m.path || pathname.startsWith(`${m.path}/`));
}
