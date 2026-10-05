import {
  contentFromName,
  formatMoney,
  internalBarcode,
  todayAR,
  unitPriceCents,
} from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { fetchProducts, type ProductItem } from "../../data/products";
import { Button } from "../../ui/Button";
import { FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Ean13 } from "../../ui/Ean13";
import { Toggle } from "../../ui/Field";
import { EmptyState, SkeletonList } from "../../ui/States";

type Template = "chica" | "mediana" | "grande";
const TEMPLATES: Record<Template, { label: string; cols: string; price: string; name: string }> = {
  chica: { label: "Chica · 24 por hoja", cols: "grid-cols-3", price: "text-2xl", name: "text-xs" },
  mediana: {
    label: "Mediana · 12 por hoja",
    cols: "grid-cols-2",
    price: "text-4xl",
    name: "text-sm",
  },
  grande: {
    label: "Grande · 4 por hoja",
    cols: "grid-cols-1 sm:grid-cols-2",
    price: "text-6xl",
    name: "text-lg",
  },
};

function Label({
  p,
  t,
  showCode,
  showUnit,
}: {
  p: ProductItem;
  t: Template;
  showCode: boolean;
  showUnit: boolean;
}) {
  const tpl = TEMPLATES[t];
  const content = p.saleUnit === "kg" ? null : contentFromName(p.name);
  const code = p.barcodes[0] ?? (p.internalCode ? internalBarcode(p.internalCode) : null);
  return (
    <div
      className={cx(
        "flex break-inside-avoid flex-col justify-between gap-1 rounded-lg border-2 border-black bg-white p-3 text-black",
        t === "grande" ? "min-h-64" : "min-h-32",
      )}
    >
      <span className={cx("font-semibold leading-tight", tpl.name)}>{p.name}</span>
      <span className={cx("tnum font-bold tracking-[-.02em] leading-none", tpl.price)}>
        {formatMoney(p.priceCents)}
        {p.saleUnit === "kg" && <span className="text-base font-semibold"> / kg</span>}
      </span>
      <div className="flex items-end justify-between gap-2">
        {showUnit && content && (
          <span className="text-[11px]">
            {formatMoney(unitPriceCents(p.priceCents, content))} /{" "}
            {content.unit === "kg" ? "kg" : "litro"}
          </span>
        )}
        {showCode && code && <Ean13 code={code} height={28} className="ml-auto h-9 w-28" />}
      </div>
    </div>
  );
}

/** Etiquetas de góndola: productos elegidos o los que cambiaron hoy, en A4. */
export function ShelfLabelsPage() {
  const [params] = useSearchParams();
  const ids = params.get("ids");
  const [source, setSource] = useState<"ids" | "today">(ids ? "ids" : "today");
  const [template, setTemplate] = useState<Template>("chica");
  const [showCode, setShowCode] = useState(true);
  const [showUnit, setShowUnit] = useState(true);
  const q = useQuery({
    queryKey: ["labels", source, ids],
    queryFn: () =>
      fetchProducts({
        limit: 500,
        ...(source === "ids" && ids ? { ids } : { priceChangedSince: todayAR() }),
      }),
  });
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 lg:p-6 print:max-w-none print:p-0">
      <div className="flex flex-col gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 flex-1 text-[22px] font-semibold">Etiquetas de góndola</h1>
          <Button
            icon={<Printer size={18} />}
            onClick={() => window.print()}
            disabled={!q.data?.items.length}
          >
            Imprimir {q.data?.items.length ?? 0}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {ids && (
            <FilterChip active={source === "ids"} onClick={() => setSource("ids")}>
              Los elegidos
            </FilterChip>
          )}
          <FilterChip active={source === "today"} onClick={() => setSource("today")}>
            Los que cambiaron hoy
          </FilterChip>
          <span className="mx-2 w-px bg-borde" />
          {(Object.keys(TEMPLATES) as Template[]).map((t) => (
            <FilterChip key={t} active={template === t} onClick={() => setTemplate(t)}>
              {TEMPLATES[t].label}
            </FilterChip>
          ))}
        </div>
        <div className="grid max-w-xl grid-cols-1 sm:grid-cols-2">
          <Toggle label="Código de barras" checked={showCode} onChange={setShowCode} />
          <Toggle label="Precio por kilo o litro" checked={showUnit} onChange={setShowUnit} />
        </div>
      </div>
      {q.isPending ? (
        <SkeletonList />
      ) : !q.data?.items.length ? (
        <EmptyState
          title={source === "today" ? "Hoy no cambió ningún precio" : "No hay productos elegidos"}
          body="Elegí productos en la lista y tocá Etiquetas."
        />
      ) : (
        <section
          className={cx("a4-sheet grid gap-2", TEMPLATES[template].cols)}
          aria-label="Vista previa A4"
        >
          {q.data.items.map((p) => (
            <Label key={p.id} p={p} t={template} showCode={showCode} showUnit={showUnit} />
          ))}
        </section>
      )}
    </div>
  );
}
