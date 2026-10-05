import { formatDate, formatMoney, formatPercent } from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Plus, ScanBarcode, Search, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useCan } from "../../app/session";
import { useViewport } from "../../app/useViewport";
import { api } from "../../data/api";
import {
  fetchCategories,
  fetchProducts,
  type ProductDetail,
  type ProductFilter,
  type ProductItem,
} from "../../data/products";
import { Button, IconButton } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { SelectField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { EmptyState, ErrorState, OfflineBanner, SkeletonList } from "../../ui/States";
import { ProductDetailView } from "./ProductDetailView";
import { ProductForm } from "./ProductForm";
import { ProductChips, StockChip } from "./StockChip";

const FILTERS: { id: ProductFilter | null; label: string; costs?: boolean }[] = [
  { id: null, label: "Todos" },
  { id: "low", label: "Stock bajo" },
  { id: "out", label: "Sin stock" },
  { id: "negative", label: "Negativo" },
  { id: "expiring", label: "Por vencer" },
  { id: "stale", label: "Sin tocar 30 días" },
  { id: "no_cost", label: "Sin costo", costs: true },
  { id: "inactive", label: "Inactivos" },
];

function shortDate(iso: string | null) {
  return iso ? formatDate(new Date(iso)).slice(0, 5) : "—";
}

/** Catálogo vacío: tres caminos grandes. */
function EmptyCatalog({ onNew }: { onNew: () => void }) {
  const navigate = useNavigate();
  const paths = [
    {
      icon: ShoppingCart,
      title: "Empezá a vender",
      body: "Lo que no está cargado se da de alta al escanearlo.",
      go: () => navigate("/vender"),
    },
    {
      icon: ScanBarcode,
      title: "Modo carga",
      body: "Pistola o cámara: código, nombre, precio, Enter y el siguiente.",
      go: () => navigate("/productos/carga"),
    },
    {
      icon: FileSpreadsheet,
      title: "Importar Excel",
      body: "Subí tu lista y relacioná las columnas.",
      go: () => navigate("/productos/importar"),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {paths.map((p) => (
          <button
            key={p.title}
            type="button"
            onClick={p.go}
            className="flex flex-col items-start gap-2 rounded-card border border-borde bg-superficie p-5 text-left hover:border-primario"
          >
            <p.icon size={28} className="text-primario" aria-hidden />
            <span className="text-base font-semibold">{p.title}</span>
            <span className="text-sm text-texto-suave">{p.body}</span>
          </button>
        ))}
      </div>
      <Button variant="secondary" onClick={onNew} className="self-start">
        O cargá uno a mano
      </Button>
    </div>
  );
}

function ChangeCategory({
  ids,
  open,
  onClose,
}: {
  ids: string[];
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, enabled: open });
  const [categoryId, setCategoryId] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      for (const id of ids)
        await api(`/api/products/${id}`, {
          method: "PATCH",
          body: { changes: { categoryId: categoryId || null } },
        });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["products"] });
      onClose();
    },
  });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Cambiar categoría de ${ids.length} productos`}
      footer={
        <Button className="flex-1" onClick={() => m.mutate()} disabled={m.isPending}>
          Cambiar
        </Button>
      }
    >
      <SelectField
        label="Categoría nueva"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">Sin categoría</option>
        {(cats.data ?? []).flatMap((c) => [
          <option key={c.id} value={c.id}>
            {c.name}
          </option>,
          ...c.children.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {c.name} › {ch.name}
            </option>
          )),
        ])}
      </SelectField>
    </Sheet>
  );
}

export function ProductsPage() {
  const { layout } = useViewport();
  const desktop = layout === "desktop" || layout === "wide";
  const navigate = useNavigate();
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const seeCosts = useCan("view_costs");
  const canEdit = useCan("change_prices");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ProductFilter | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ product: ProductItem | ProductDetail | null } | null>(null);
  const [catSheet, setCatSheet] = useState(false);
  const openId = desktop ? search.get("p") : (params.id ?? null);

  const list = useQuery({
    queryKey: ["products", { q, filter }],
    queryFn: () => fetchProducts({ q: q || undefined, filter: filter ?? undefined, limit: 200 }),
    placeholderData: (prev) => prev,
  });
  const items = list.data?.items ?? [];
  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id));
  const ids = useMemo(() => [...selected], [selected]);

  const open = (id: string) => {
    if (desktop) setSearch({ p: id });
    else navigate(`/productos/${id}`);
  };
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  if (!desktop && params.id) {
    return (
      <div className="min-h-full bg-superficie">
        <ProductDetailView
          id={params.id}
          onBack={() => navigate("/productos")}
          onEdit={(p) => setForm({ product: p })}
        />
        {form && <ProductForm open product={form.product} onClose={() => setForm(null)} />}
      </div>
    );
  }

  const header = desktop ? (
    <div className="flex items-center gap-3">
      <h1 className="m-0 text-[22px] font-semibold">Productos</h1>
      {list.data && (
        <span className="text-texto-suave">· {list.data.total.toLocaleString("es-AR")}</span>
      )}
      <span className="flex-1" />
      <label className="flex h-9 w-60 items-center gap-2 rounded-lg border border-borde bg-superficie px-2.5 text-[13px] text-texto-suave">
        <ScanBarcode size={16} aria-hidden />
        <input
          aria-label="Buscar productos"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre, código o PLU"
          className="min-w-0 flex-1 bg-transparent text-texto outline-none"
        />
      </label>
      <Button
        variant="secondary"
        className="h-9 text-[13px]"
        onClick={() => navigate("/productos/carga")}
      >
        Modo carga
      </Button>
      <Button
        variant="secondary"
        className="h-9 text-[13px]"
        onClick={() => navigate("/productos/importar")}
      >
        Importar
      </Button>
      {canEdit && (
        <Button className="h-9 text-[13px]" onClick={() => setForm({ product: null })}>
          Nuevo producto
        </Button>
      )}
    </div>
  ) : (
    <div className="flex items-center gap-2 border-b border-borde bg-superficie px-4 py-3">
      <label className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-borde bg-fondo px-3 text-texto-suave">
        <Search size={22} aria-hidden />
        <input
          aria-label="Buscar productos"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            list.data
              ? `Buscar en ${list.data.total.toLocaleString("es-AR")} productos`
              : "Nombre o código"
          }
          className="min-w-0 flex-1 bg-transparent text-base text-texto outline-none"
        />
      </label>
      {canEdit && (
        <IconButton label="Nuevo producto" onClick={() => setForm({ product: null })}>
          <Plus size={24} />
        </IconButton>
      )}
    </div>
  );

  const filters = (
    <div className={cx("flex gap-2", desktop ? "flex-wrap" : "overflow-x-auto px-4 pt-3")}>
      {FILTERS.filter((f) => !f.costs || seeCosts).map((f) => (
        <FilterChip key={f.label} active={filter === f.id} onClick={() => setFilter(f.id)}>
          {f.label}
        </FilterChip>
      ))}
    </div>
  );

  let body: React.ReactNode;
  if (list.isPending) body = <SkeletonList rows={8} />;
  else if (list.isError) body = <ErrorState onRetry={() => list.refetch()} />;
  else if (!items.length && !q && !filter)
    body = <EmptyCatalog onNew={() => setForm({ product: null })} />;
  else if (!items.length)
    body = (
      <EmptyState
        title="No encontramos productos"
        body={q ? `Nada coincide con "${q}".` : "No hay productos con ese filtro."}
      />
    );
  else if (desktop) {
    // Con la ficha abierta, la fecha se esconde para que entre el nombre.
    const showDate = !openId;
    const cols = [
      "28px",
      "minmax(0,1fr)",
      "132px",
      ...(seeCosts ? ["76px", "48px"] : []),
      "80px",
      ...(showDate ? ["56px"] : []),
    ].join(" ");
    body = (
      <div className="self-start overflow-hidden rounded-card border border-borde bg-superficie">
        {selected.size > 0 && (
          <div className="flex items-center gap-3 border-b border-borde bg-primario-suave px-4 py-2 text-[13px] font-semibold text-primario">
            <span>{selected.size} seleccionados</span>
            <span className="font-normal text-texto-suave">·</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => navigate(`/productos/precios?ids=${ids.join(",")}`)}
              >
                Cambiar precio
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={() => setCatSheet(true)}>
                Cambiar categoría
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(`/productos/etiquetas?ids=${ids.join(",")}`)}
            >
              Etiquetas
            </button>
            <button
              type="button"
              onClick={() => navigate(`/compras/sugerido?ids=${ids.join(",")}`)}
            >
              Sumar al pedido
            </button>
          </div>
        )}
        <table className="block w-full border-collapse" aria-label="Productos">
          <thead className="block">
            <tr
              className="grid h-9 items-center gap-2.5 border-b border-borde bg-fondo px-3.5 text-left text-xs font-semibold text-texto-suave"
              style={{ gridTemplateColumns: cols }}
            >
              <th className="font-semibold">
                <Checkbox
                  label="Elegir todos"
                  checked={allChecked}
                  indeterminate={selected.size > 0 && !allChecked}
                  onChange={(v) => setSelected(v ? new Set(items.map((i) => i.id)) : new Set())}
                />
              </th>
              <th className="font-semibold">Producto</th>
              <th className="font-semibold">Stock</th>
              {seeCosts && <th className="text-right font-semibold">Costo</th>}
              {seeCosts && <th className="text-right font-semibold">Gan.</th>}
              <th className="text-right font-semibold">Precio</th>
              {showDate && <th className="font-semibold">Actualiz.</th>}
            </tr>
          </thead>
          <tbody className="block">
            {items.map((p) => (
              <tr
                key={p.id}
                tabIndex={0}
                onClick={() => open(p.id)}
                onKeyDown={(e) => e.key === "Enter" && open(p.id)}
                className={cx(
                  "grid h-10 cursor-pointer items-center gap-2.5 border-b border-borde px-3.5 last:border-b-0 hover:bg-fondo",
                  (selected.has(p.id) || openId === p.id) && "bg-primario-suave/60",
                )}
                style={{ gridTemplateColumns: cols }}
              >
                <td>
                  <Checkbox
                    label={`Elegir ${p.name}`}
                    checked={selected.has(p.id)}
                    onChange={(v) => toggle(p.id, v)}
                  />
                </td>
                <td className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-medium">{p.name}</span>
                  <span className="truncate text-[11px] text-texto-suave">
                    {[
                      p.barcodes[0] ?? (p.internalCode ? `PLU ${p.internalCode}` : null),
                      p.supplierName,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </td>
                <td>
                  <StockChip p={p} />
                </td>
                {seeCosts && (
                  <td className="tnum text-right text-[13px]">
                    {p.costCents != null ? formatMoney(p.costCents) : "—"}
                  </td>
                )}
                {seeCosts && (
                  <td
                    className={cx(
                      "tnum text-right text-[13px]",
                      p.marginBp != null && p.marginBp < 0 && "text-peligro",
                    )}
                  >
                    {p.marginBp != null ? formatPercent(p.marginBp) : "—"}
                  </td>
                )}
                <td className="tnum text-right text-[13px] font-semibold">
                  {formatMoney(p.priceCents)}
                </td>
                {showDate && (
                  <td className="text-xs text-texto-suave">{shortDate(p.priceUpdatedAt)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else {
    body = (
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => open(p.id)}
              className="flex min-h-[72px] w-full items-center gap-3 rounded-card border border-borde bg-superficie px-3.5 py-3 text-left"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-semibold">{p.name}</span>
                <div className="flex flex-wrap gap-1">
                  <StockChip p={p} />
                  <ProductChips p={{ ...p, ageRestricted: false, fixedPrice: false }} />
                </div>
              </div>
              <span className="tnum text-xl font-semibold tracking-[-.01em] whitespace-nowrap">
                {formatMoney(p.priceCents)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={cx("flex flex-col", desktop ? "h-full gap-3 px-6 py-5" : "")}>
      {header}
      {filters}
      {list.data?.offline && (
        <div className={desktop ? "" : "px-4 pt-3"}>
          <OfflineBanner />
        </div>
      )}
      {desktop ? (
        <div
          className={cx(
            "grid min-h-0 flex-1 gap-4",
            openId ? "grid-cols-[minmax(0,1fr)_340px]" : "grid-cols-1",
          )}
        >
          <div className="min-h-0 overflow-y-auto">{body}</div>
          {openId && (
            <aside
              aria-label="Ficha del producto"
              className="flex min-h-0 flex-col overflow-hidden rounded-card border border-borde bg-superficie"
            >
              <ProductDetailView key={openId} id={openId} onEdit={(p) => setForm({ product: p })} />
            </aside>
          )}
        </div>
      ) : (
        <div className="p-4">{body}</div>
      )}
      {form && (
        <ProductForm
          open
          product={form.product}
          onClose={() => setForm(null)}
          onSaved={(p) => desktop && setSearch({ p: p.id })}
        />
      )}
      <ChangeCategory ids={ids} open={catSheet} onClose={() => setCatSheet(false)} />
    </div>
  );
}
