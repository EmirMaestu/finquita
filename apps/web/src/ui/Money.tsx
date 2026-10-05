import { formatMoney } from "@mostrador/shared";
import { cx } from "./cx";

/** Monto en formato argentino, con cifras tabulares. Color solo si significa algo. */
export function Money({
  cents,
  signed,
  tone,
  className,
}: {
  cents: number;
  /** Muestra + en positivos (sobrante, saldo a favor). */
  signed?: boolean;
  tone?: "auto" | "ok" | "peligro";
  className?: string;
}) {
  const color =
    tone === "auto"
      ? cents > 0
        ? "text-exito"
        : cents < 0
          ? "text-peligro"
          : ""
      : tone === "ok"
        ? "text-exito"
        : tone === "peligro"
          ? "text-peligro"
          : "";
  return (
    <span className={cx("tnum", color, className)}>
      {signed && cents > 0 ? "+" : ""}
      {formatMoney(cents)}
    </span>
  );
}
