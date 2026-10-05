import { NavLink } from "react-router";
import { cx } from "../../ui/cx";

const TABS = [
  ["/compras/sugerido", "Sugerido"],
  ["/compras/pedidos", "Pedidos"],
  ["/compras/proveedores", "Proveedores"],
  ["/compras/recepcion", "Recepción"],
  ["/compras/facturas", "Facturas y pagos"],
  ["/compras/listas", "Listas de precios"],
] as const;

/** Pestañas del módulo Compras. */
export function PurchasesTabs() {
  return (
    <nav
      aria-label="Compras"
      className="flex gap-1 overflow-x-auto rounded-lg bg-neutro-suave p-1 text-[13px] font-semibold"
    >
      {TABS.map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cx(
              "shrink-0 rounded-md px-3 py-1.5 no-underline",
              isActive ? "bg-superficie text-texto" : "text-texto-suave",
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
