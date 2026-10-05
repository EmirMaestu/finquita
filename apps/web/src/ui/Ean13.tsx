import { barRects, ean13Modules } from "@mostrador/shared";

/** Código de barras EAN-13 en SVG (para la planilla y las etiquetas). */
export function Ean13({
  code,
  height = 48,
  className,
}: {
  code: string;
  height?: number;
  className?: string;
}) {
  let rects: { x: number; w: number }[] = [];
  try {
    rects = barRects(ean13Modules(code));
  } catch {
    return <span className="text-xs text-peligro">Código inválido</span>;
  }
  return (
    <svg
      viewBox={`0 0 95 ${height + 12}`}
      className={className}
      role="img"
      aria-label={`Código ${code}`}
      preserveAspectRatio="none"
    >
      {rects.map((r) => (
        <rect key={r.x} x={r.x} y={0} width={r.w} height={height} fill="#000" />
      ))}
      <text
        x={47.5}
        y={height + 10}
        textAnchor="middle"
        fontSize={9}
        fontFamily="Inter, sans-serif"
        fill="#000"
      >
        {code}
      </text>
    </svg>
  );
}
