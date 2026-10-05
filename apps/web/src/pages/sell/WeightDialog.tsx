import {
  cutLabel,
  formatKg,
  formatMoney,
  gramsForMoney,
  priceForWeight,
  typedGramsToKg,
  WEIGHT_SHORTCUTS,
} from "@mostrador/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalProduct } from "../../data/types";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { NumPad } from "../../ui/NumPad";

/** Gramos tipeados a kilos: "235" → 0,235 kg. */
export const gramsToKg = typedGramsToKg;

type Mode = "weight" | "money";

/**
 * Teclado de peso (no hay balanza etiquetadora): se tipea lo que marca la balanza
 * (235 = 0,235 kg), con atajos de 100 g, ¼ kg y ½ kg. Modo por plata: "$ 2.000 de queso"
 * → "Cortá 148 g", y se cobra el peso real.
 */
export function WeightDialog({
  product,
  onAdd,
  onClose,
  initialMode = "weight",
}: {
  product: LocalProduct;
  onAdd: (kg: number) => void;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [grams, setGrams] = useState("");
  const [money, setMoney] = useState("");
  const [field, setField] = useState<"money" | "grams">(
    initialMode === "money" ? "money" : "grams",
  );
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  const kg = typedGramsToKg(grams);
  const moneyCents = Number(money || "0") * 100;
  const suggested = gramsForMoney(moneyCents, product.priceCents);

  const onKey = useCallback(
    (k: string) => {
      const edit = (t: string, max: number) =>
        k === "back" ? t.slice(0, -1) : k === "," ? t : (t + k).replace(/^0+/, "").slice(0, max);
      if (field === "money") setMoney((t) => edit(t, 7));
      else setGrams((t) => edit(t, 6));
    },
    [field],
  );

  const next = useCallback(() => {
    if (mode === "money" && field === "money") {
      if (!moneyCents) return;
      // Del pedido en plata a pesar: se propone lo que hay que cortar.
      setGrams(String(suggested));
      setField("grams");
      return;
    }
    if (kg > 0) onAdd(kg);
  }, [mode, field, moneyCents, suggested, kg, onAdd]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, onClose]);

  const amount = priceForWeight(product.priceCents, kg);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(31,27,22,.45)] lg:items-center">
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Peso de ${product.name}`}
        className="grid w-full gap-6 rounded-t-2xl bg-superficie p-5 shadow-xl outline-none lg:max-w-[720px] lg:grid-cols-[1fr_300px] lg:rounded-card lg:p-7"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="size-14 shrink-0 rounded-lg bg-[repeating-linear-gradient(135deg,var(--neutro-suave)_0_6px,var(--borde)_6px_12px)]"
            />
            <div>
              <div className="text-xl font-semibold">{product.name}</div>
              <div className="text-texto-suave">
                {formatMoney(product.priceCents)} / kg
                {product.internalCode ? ` · PLU ${product.internalCode}` : ""}
              </div>
            </div>
          </div>
          <div className="inline-flex w-max overflow-hidden rounded-lg border border-borde text-[13px] font-semibold">
            {(
              [
                ["weight", "Por peso"],
                ["money", "Por plata"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setField(m === "money" ? "money" : "grams");
                }}
                className={cx("h-9 px-4", mode === m ? "bg-texto text-fondo" : "bg-superficie")}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "money" && (
            <>
              <button
                type="button"
                onClick={() => setField("money")}
                className={cx(
                  "flex flex-col gap-1 rounded-lg border bg-fondo px-4 py-3.5 text-left",
                  field === "money" ? "border-2 border-primario" : "border-borde",
                )}
              >
                <span className="text-xs text-texto-suave">Plata pedida</span>
                <output
                  className="tnum text-[40px] leading-none font-semibold tracking-[-.02em]"
                  aria-label="Plata pedida"
                >
                  {formatMoney(moneyCents)}
                </output>
              </button>
              <div className="flex flex-col gap-1 rounded-lg bg-acento-suave p-4">
                <span className="text-xs font-semibold text-texto-suave">Para el fiambrero</span>
                <output
                  className="tnum text-[40px] leading-none font-semibold tracking-[-.02em]"
                  aria-label="Para cortar"
                >
                  {moneyCents ? cutLabel(suggested) : "—"}
                </output>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setField("grams")}
            className={cx(
              "flex flex-col gap-1 rounded-lg border bg-fondo px-4 py-3.5 text-left",
              field === "grams" ? "border-2 border-primario" : "border-borde",
            )}
          >
            <span className="text-xs text-texto-suave">
              {mode === "money" ? "Peso real que marca la balanza" : "Peso que marca la balanza"}
            </span>
            <span className="flex items-baseline justify-between">
              <output
                className={cx(
                  "tnum leading-none font-semibold tracking-[-.02em]",
                  mode === "money" ? "text-2xl" : "text-[40px]",
                )}
                aria-label="Peso"
              >
                {formatKg(kg)}
              </output>
              <span className="tnum text-lg font-semibold">{formatMoney(amount)}</span>
            </span>
          </button>
          {mode === "money" && (
            <div className="text-xs text-texto-suave">
              Se cobra el peso real, no la plata pedida.
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {WEIGHT_SHORTCUTS.map(([label, g]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setGrams(String(g));
                  setField("grams");
                }}
                className="h-9 flex-1 rounded-lg border border-borde bg-superficie text-[13px] font-semibold hover:bg-neutro-suave"
              >
                {label}
              </button>
            ))}
          </div>
          <NumPad onKey={onKey} big />
          <Button
            size="xl"
            disabled={mode === "money" && field === "money" ? !moneyCents : kg <= 0}
            onClick={next}
            className="mt-auto"
          >
            {mode === "money" && field === "money"
              ? "Ya corté · ⏎"
              : `Agregar ${formatMoney(amount)} · ⏎`}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar · Esc
          </Button>
        </div>
      </div>
    </div>
  );
}
