import { formatKg, formatMoney, lineTotal } from "@mostrador/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalProduct } from "../../data/types";
import { Button } from "../../ui/Button";
import { NumPad } from "../../ui/NumPad";

/** Gramos tipeados a kilos: "235" → 0,235 kg. */
export function gramsToKg(typed: string): number {
  const n = Number(typed || "0");
  return Math.round(n) / 1000;
}

/**
 * Teclado de peso: se tipea lo que marca la balanza (235 = 0,235 kg), con atajos de
 * 100 g, ¼ kg y ½ kg.
 */
export function WeightDialog({
  product,
  onAdd,
  onClose,
}: {
  product: LocalProduct;
  onAdd: (kg: number) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  const kg = gramsToKg(typed);
  const onKey = useCallback((k: string) => {
    setTyped((t) =>
      k === "back" ? t.slice(0, -1) : k === "," ? t : (t + k).replace(/^0+/, "").slice(0, 6),
    );
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter" && kg > 0) {
        e.preventDefault();
        onAdd(kg);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [kg, onAdd, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(31,27,22,.45)] lg:items-center">
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Peso de ${product.name}`}
        className="grid w-full gap-6 rounded-t-2xl bg-superficie p-5 shadow-xl lg:max-w-[720px] lg:grid-cols-[1fr_300px] lg:rounded-card lg:p-7"
      >
        <div className="flex flex-col gap-4">
          <div>
            <div className="text-xl font-semibold">{product.name}</div>
            <div className="text-texto-suave">
              {formatMoney(product.priceCents)} / kg
              {product.internalCode ? ` · PLU ${product.internalCode}` : ""}
            </div>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-borde bg-fondo px-4 py-3.5">
            <div className="text-xs text-texto-suave">Peso que marca la balanza</div>
            <output
              className="tnum text-[40px] leading-none font-semibold tracking-[-.02em]"
              aria-label="Peso"
            >
              {formatKg(kg)}
            </output>
          </div>
          <div className="flex items-baseline justify-between text-lg">
            <span className="text-texto-suave">Importe</span>
            <span className="tnum font-semibold">
              {formatMoney(lineTotal(product.priceCents, kg))}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {[
              ["100 g", "100"],
              ["¼ kg", "250"],
              ["½ kg", "500"],
            ].map(([label, g]) => (
              <button
                key={label}
                type="button"
                onClick={() => setTyped(g ?? "")}
                className="h-9 flex-1 rounded-lg border border-borde bg-superficie text-[13px] font-semibold hover:bg-neutro-suave"
              >
                {label}
              </button>
            ))}
          </div>
          <NumPad onKey={onKey} big />
          <Button size="xl" disabled={kg <= 0} onClick={() => onAdd(kg)}>
            Agregar {formatMoney(lineTotal(product.priceCents, kg))} · ⏎
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar · Esc
          </Button>
        </div>
      </div>
    </div>
  );
}
