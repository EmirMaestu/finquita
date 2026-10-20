import { formatMoney } from "@mostrador/shared";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { searchCustomers } from "../data/customers";
import type { LocalCustomer, LocalProduct } from "../data/types";
import { productIndex } from "../sell/searchIndex";
import { useSyncStatus } from "../sync/status";
import { Sheet } from "../ui/Sheet";
import { useCan } from "./session";

/** Búsqueda global (Ctrl+K o la lupa): productos, clientes, ventas por número y acciones. */
let open = false;
const listeners = new Set<() => void>();
export const globalSearch = {
  open() {
    open = true;
    for (const l of listeners) l();
  },
  close() {
    open = false;
    for (const l of listeners) l();
  },
};
function useOpen() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => open,
  );
}

type Action = { label: string; path: string; perm?: Parameters<typeof useCan>[0] };
export const ACTIONS: Action[] = [
  { label: "Nueva venta", path: "/vender", perm: "sell" },
  { label: "Cerrar caja (arqueo y cierre)", path: "/caja/cierre", perm: "shift" },
  { label: "Abrir caja", path: "/caja", perm: "shift" },
  { label: "Historial de ventas", path: "/vender/historial", perm: "sell" },
  { label: "Historial de cierres", path: "/caja/historial", perm: "shift" },
  { label: "Cambiar precios", path: "/productos/precios", perm: "change_prices" },
  { label: "Modo carga", path: "/productos/carga" },
  { label: "Importar desde Excel", path: "/productos/importar", perm: "change_prices" },
  { label: "Recibir mercadería", path: "/compras/recepcion", perm: "count_receive" },
  { label: "Pedido sugerido", path: "/compras/sugerido", perm: "build_orders" },
  { label: "Proveedores", path: "/compras/proveedores", perm: "build_orders" },
  { label: "Clientes y fiado", path: "/clientes", perm: "sell" },
  { label: "Reportes", path: "/reportes", perm: "reports" },
  { label: "Avisos", path: "/avisos" },
  { label: "Ajustes", path: "/ajustes", perm: "settings" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Acciones que coinciden con lo tipeado ("cerrar caja", "precios"). */
export function matchActions(term: string, list = ACTIONS): Action[] {
  const q = norm(term.trim());
  if (!q) return [];
  return list.filter((a) => norm(a.label).includes(q));
}

export function GlobalSearch() {
  const isOpen = useOpen();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const { version } = useSyncStatus();
  const can = {
    sell: useCan("sell"),
    shift: useCan("shift"),
    change_prices: useCan("change_prices"),
    count_receive: useCan("count_receive"),
    build_orders: useCan("build_orders"),
    reports: useCan("reports"),
    settings: useCan("settings"),
  } as Record<string, boolean>;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        globalSearch.open();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setTerm("");
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;
    const q = term.trim();
    if (!q) {
      setProducts([]);
      setCustomers([]);
      return;
    }
    void Promise.all([productIndex(version), searchCustomers(q, 5)]).then(([idx, cs]) => {
      if (cancelled) return;
      setProducts(idx.search(q, 6));
      setCustomers(cs);
    });
    return () => {
      cancelled = true;
    };
  }, [term, version]);

  const actions = useMemo(
    () => matchActions(term).filter((a) => !a.perm || can[a.perm]),
    [term, can],
  );
  const saleNumber = /^\d{1,6}$/.test(term.trim()) ? Number(term.trim()) : null;
  const go = (path: string) => {
    globalSearch.close();
    navigate(path);
  };
  if (!isOpen) return null;
  const row =
    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-neutro-suave";
  return (
    <Sheet open onClose={() => globalSearch.close()} title="Buscar">
      <div className="flex flex-col gap-3">
        <label className="flex h-12 items-center gap-2.5 rounded-lg border-2 border-primario bg-superficie px-3">
          <Search size={20} className="text-primario" aria-hidden />
          <input
            aria-label="Buscar en todo"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Producto, cliente, N° de venta o qué querés hacer"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
        {!term.trim() && (
          <p className="m-0 text-sm text-texto-suave">
            Probá "yerba", "rosa", "cerrar caja" o "cambiar precios".
          </p>
        )}
        {actions.length > 0 && (
          <section aria-label="Acciones">
            <h3 className="m-0 mb-1 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Acciones
            </h3>
            {actions.map((a) => (
              <button key={a.path} type="button" className={row} onClick={() => go(a.path)}>
                {a.label}
              </button>
            ))}
          </section>
        )}
        {products.length > 0 && (
          <section aria-label="Productos">
            <h3 className="m-0 mb-1 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Productos
            </h3>
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                className={row}
                onClick={() => go(`/productos/${p.id}`)}
              >
                <span className="flex-1">{p.name}</span>
                <span className="tnum text-texto-suave">{formatMoney(p.priceCents)}</span>
              </button>
            ))}
          </section>
        )}
        {customers.length > 0 && can.sell && (
          <section aria-label="Clientes">
            <h3 className="m-0 mb-1 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Clientes
            </h3>
            {customers.map((c) => (
              <button
                key={c.id}
                type="button"
                className={row}
                onClick={() => go(`/clientes/${c.id}`)}
              >
                <span className="flex-1">{c.name}</span>
                <span className="tnum text-texto-suave">
                  {c.balanceCents ? `debe ${formatMoney(c.balanceCents)}` : "al día"}
                </span>
              </button>
            ))}
          </section>
        )}
        {saleNumber !== null && can.sell && (
          <button
            type="button"
            className={row}
            onClick={() => go(`/vender/historial?numero=${saleNumber}`)}
          >
            Venta {String(saleNumber).padStart(6, "0")} en el historial
          </button>
        )}
        {term.trim() &&
          !actions.length &&
          !products.length &&
          !customers.length &&
          saleNumber === null && <p className="m-0 text-sm text-texto-suave">Nada con "{term}".</p>}
      </div>
    </Sheet>
  );
}
