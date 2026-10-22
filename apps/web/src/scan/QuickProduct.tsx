import { formatMoney, formatQty } from "@mostrador/shared";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useCan } from "../app/session";
import { localStock } from "../data/catalog";
import type { LocalProduct } from "../data/types";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

/** Ficha rápida al escanear desde fuera de Vender: precio, stock y Vender, Ajustar, Agregar al pedido. */
export function QuickProduct({ product, onClose }: { product: LocalProduct; onClose: () => void }) {
  const navigate = useNavigate();
  const canSell = useCan("sell");
  const canAdjust = useCan("adjust_stock");
  const canOrder = useCan("build_orders");
  const [stock, setStock] = useState<number | null>(null);
  useEffect(() => {
    void localStock(product).then(setStock);
  }, [product]);
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={product.name}
      footer={
        <div className="grid w-full grid-cols-2 gap-2">
          {canSell && <Button onClick={() => go(`/vender?agregar=${product.id}`)}>Vender</Button>}
          {canAdjust && (
            <Button
              variant={canSell ? "secondary" : "primary"}
              onClick={() => go(`/productos/${product.id}?ajustar=1`)}
            >
              Ajustar stock
            </Button>
          )}
          {canOrder && (
            <Button variant="secondary" onClick={() => go(`/compras/sugerido?ids=${product.id}`)}>
              Sumar al pedido
            </Button>
          )}
          <Button variant="secondary" onClick={() => go(`/productos/${product.id}`)}>
            Ver ficha
          </Button>
        </div>
      }
    >
      <div className="flex items-baseline justify-between">
        <span className="text-texto-suave">Precio{product.saleUnit === "kg" ? " por kg" : ""}</span>
        <span className="tnum text-3xl font-semibold">{formatMoney(product.priceCents)}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-texto-suave">Stock</span>
        <span
          className={`tnum text-lg font-semibold ${stock !== null && stock <= 0 ? "text-peligro" : ""}`}
        >
          {stock === null ? "…" : formatQty(stock, product.saleUnit === "unit" ? "unit" : "kg")}
          {/* Un estado nunca va solo con color. */}
          {stock !== null && stock < 0 ? " · negativo" : stock === 0 ? " · sin stock" : ""}
        </span>
      </div>
    </Sheet>
  );
}
