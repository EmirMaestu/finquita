import { type Cart, emptyCart } from "@mostrador/shared";
import { useSyncExternalStore } from "react";
import { setSaleInProgress } from "../lib/saleActivity";

/** La venta en curso: sobrevive a recargar la página. */
type State = { cart: Cart; selected: string | null; multiplier: number | null };

const KEY = "mostrador.sale";

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...(JSON.parse(raw) as State), multiplier: null };
  } catch {}
  return { cart: emptyCart(), selected: null, multiplier: null };
}

let state: State =
  typeof window === "undefined" ? { cart: emptyCart(), selected: null, multiplier: null } : load();
const listeners = new Set<() => void>();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export const sale = {
  get: () => state,
  set(patch: Partial<State>) {
    state = { ...state, ...patch };
    save();
    setSaleInProgress(state.cart.lines.length > 0);
    for (const l of listeners) l();
  },
  setCart(cart: Cart, selected?: string | null) {
    const sel =
      selected === undefined
        ? cart.lines.some((l) => l.id === state.selected)
          ? state.selected
          : (cart.lines.at(-1)?.id ?? null)
        : selected;
    sale.set({ cart, selected: sel });
  },
  reset() {
    sale.set({ cart: emptyCart(), selected: null, multiplier: null });
  },
};

export function useSale(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

// Ventas en espera (F6): se estaciona una venta para atender a otro cliente.
export type HeldSale = { id: string; cart: Cart; at: string; label: string };
const HELD = "mostrador.held";
let held: HeldSale[] = (() => {
  try {
    return typeof window === "undefined"
      ? []
      : (JSON.parse(localStorage.getItem(HELD) ?? "[]") as HeldSale[]);
  } catch {
    return [];
  }
})();
const heldListeners = new Set<() => void>();
function saveHeld() {
  try {
    localStorage.setItem(HELD, JSON.stringify(held));
  } catch {}
  for (const l of heldListeners) l();
}

export const heldSales = {
  list: () => held,
  hold(cart: Cart, label: string) {
    held = [...held, { id: crypto.randomUUID(), cart, at: new Date().toISOString(), label }];
    saveHeld();
  },
  take(id: string): Cart | null {
    const h = held.find((x) => x.id === id);
    held = held.filter((x) => x.id !== id);
    saveHeld();
    return h?.cart ?? null;
  },
};

export function useHeldSales(): HeldSale[] {
  return useSyncExternalStore(
    (cb) => {
      heldListeners.add(cb);
      return () => heldListeners.delete(cb);
    },
    () => held,
    () => held,
  );
}
