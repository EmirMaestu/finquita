import { formatMoney, formatQty } from "@mostrador/shared";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { localStock } from "../data/catalog";
import type { LocalProduct } from "../data/types";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

/** Ficha rápida al escanear desde fuera de Vender: precio, stock y Vender, Ajustar, Agregar al pedido. */
export function QuickProduct({ product, onClose }: { product: LocalProduct; onClose: () => void }) {
  const navigate = useNavigate();
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
        <div className="grid w-full grid-cols-3 gap-2">
          <Button onClick={() => go(`/vender?agregar=${product.id}`)}>Vender</Button>
          <Button variant="secondary" onClick={() => go(`/productos/${product.id}?ajustar=1`)}>
            Ajustar
          </Button>
          <Button variant="secondary" onClick={() => go(`/compras/sugerido?ids=${product.id}`)}>
            Al pedido
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
        </span>
      </div>
    </Sheet>
  );
}
