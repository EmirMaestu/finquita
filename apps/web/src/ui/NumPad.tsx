import { Delete } from "lucide-react";
import { useEffect } from "react";
import { cx } from "./cx";

/** Teclado numérico: efectivo, peso, cantidad y PIN. Teclas de 56 en celular, 52 en compu. */
export function NumPad({
  onKey,
  decimal = false,
  className,
  big,
  keyboard = true,
}: {
  onKey: (k: string) => void;
  /** Muestra la coma decimal. */
  decimal?: boolean;
  className?: string;
  big?: boolean;
  /** Escucha el teclado físico. */
  keyboard?: boolean;
}) {
  useEffect(() => {
    if (!keyboard) return;
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) onKey(e.key);
      else if (e.key === "Backspace") onKey("back");
      else if (decimal && (e.key === "," || e.key === ".")) onKey(",");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onKey, decimal, keyboard]);
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "," : "", "0", "back"];
  return (
    <div className={cx("grid grid-cols-3 gap-2", className)}>
      {keys.map((k) =>
        k === "" ? (
          <span key="vacío" />
        ) : (
          <button
            key={k}
            type="button"
            aria-label={k === "back" ? "Borrar" : k}
            onClick={() => onKey(k)}
            className={cx(
              "inline-flex items-center justify-center rounded-lg border border-borde bg-superficie font-medium text-texto hover:bg-neutro-suave active:bg-neutro-suave",
              big ? "h-14 text-[22px]" : "h-14 text-xl lg:h-[52px]",
            )}
          >
            {k === "back" ? <Delete size={22} aria-hidden /> : k}
          </button>
        ),
      )}
    </div>
  );
}
