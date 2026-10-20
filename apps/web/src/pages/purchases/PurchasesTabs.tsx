import { Navigate, NavLink } from "react-router";
import { useCan } from "../../app/session";
import { cx } from "../../ui/cx";

/** Pestañas del módulo Compras: solo las que el rol puede abrir. */
export function usePurchasesTabs(): [string, string][] {
  const orders = useCan("build_orders");
  const costs = useCan("view_costs");
  const prices = useCan("change_prices");
  const receive = useCan("count_receive");
  return [
    ...(orders ? ([["/compras/sugerido", "Sugerido"]] as [string, string][]) : []),
    ...(orders ? ([["/compras/pedidos", "Pedidos"]] as [string, string][]) : []),
    ...(orders ? ([["/compras/proveedores", "Proveedores"]] as [string, string][]) : []),
    ...(receive ? ([["/compras/recepcion", "Recepción"]] as [string, string][]) : []),
    ...(costs ? ([["/compras/facturas", "Facturas y pagos"]] as [string, string][]) : []),
    ...(prices ? ([["/compras/listas", "Listas de precios"]] as [string, string][]) : []),
  ];
}

/** /compras: a Pedidos para quien arma pedidos; a Recepción para el repositor. */
export function PurchasesHome() {
  const tabs = usePurchasesTabs();
  return <Navigate to={tabs[0]?.[0] ?? "/compras/recepcion"} replace />;
}

/** Pestañas del módulo Compras. */
export function PurchasesTabs() {
  const tabs = usePurchasesTabs();
  if (tabs.length <= 1) return null;
  return (
    <nav
      aria-label="Compras"
      className="flex gap-1 overflow-x-auto rounded-lg bg-neutro-suave p-1 text-[13px] font-semibold"
    >
      {tabs.map(([to, label]) => (
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
