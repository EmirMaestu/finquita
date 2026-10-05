import { formatQty } from "@mostrador/shared";
import { CHIP_ICONS, Chip } from "../../ui/Chip";

type P = {
  stockState: string;
  stockQty: number;
  minStock: number | null;
  saleUnit: "unit" | "kg" | "100g";
  kind: string;
};

/** Chip de stock: OK, Bajo · 3 / 8, Sin stock, Negativo −2. */
export function StockChip({ p, size }: { p: P; size?: "sm" | "md" }) {
  const q = (v: number) => formatQty(v, p.saleUnit === "unit" ? "unit" : "kg");
  if (p.kind === "service") return <Chip size={size}>Servicio</Chip>;
  switch (p.stockState) {
    case "negative":
      return (
        <Chip tone="peligro" icon={CHIP_ICONS.negative} size={size}>
          Negativo {q(p.stockQty).replace("-", "−")}
        </Chip>
      );
    case "out":
      return (
        <Chip tone="peligro" icon={CHIP_ICONS.out} size={size}>
          Sin stock
        </Chip>
      );
    case "low":
      return (
        <Chip tone="alerta" icon={CHIP_ICONS.low} size={size}>
          Bajo · {q(p.stockQty)} / {q(p.minStock ?? 0)}
        </Chip>
      );
    default:
      return (
        <Chip tone="ok" icon={CHIP_ICONS.ok} size={size}>
          OK · {q(p.stockQty)}
        </Chip>
      );
  }
}

/** Chips de atributos y avisos: +18, precio fijo, sin costo, pierde plata, revisar precio, completar ficha. */
export function ProductChips({
  p,
}: {
  p: { chips: string[]; ageRestricted: boolean; fixedPrice: boolean };
}) {
  return (
    <>
      {p.chips.includes("losing_money") && (
        <Chip tone="peligro" icon={CHIP_ICONS.losing}>
          Pierde plata
        </Chip>
      )}
      {p.chips.includes("price_review") && (
        <Chip tone="alerta" icon={CHIP_ICONS.review}>
          Revisar precio
        </Chip>
      )}
      {p.chips.includes("no_cost") && <Chip icon={CHIP_ICONS.noCost}>Sin costo</Chip>}
      {p.chips.includes("needs_review") && (
        <Chip tone="info" icon={CHIP_ICONS.complete}>
          Completar ficha
        </Chip>
      )}
      {p.ageRestricted && <Chip icon={CHIP_ICONS.adult}>+18</Chip>}
      {p.fixedPrice && <Chip icon={CHIP_ICONS.fixed}>Precio fijo</Chip>}
    </>
  );
}
