import {
  formatDate,
  PROMO_LABEL,
  type PromotionKind,
  promoStatus,
  todayAR,
} from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NoPermissionFor } from "../../app/guards";
import { useCan } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { fetchCategories, fetchProducts } from "../../data/products";
import { Button } from "../../ui/Button";
import { Chip, FilterChip } from "../../ui/Chip";
import { SelectField, TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";

type Promo = {
  id: string;
  name: string;
  kind: PromotionKind;
  params: { n?: number; percentBp?: number; comboPriceCents?: number };
  categoryId: string | null;
  products: { productId: string; qty: number; name: string }[];
  startsOn: string | null;
  endsOn: string | null;
  weekdays: number[] | null;
  active: boolean;
};

const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const STATUS_LABEL = {
  active: ["Activa", "ok"],
  scheduled: ["Programada", "info"],
  ended: ["Terminada", "neutro"],
} as const;

function PromoForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const [kind, setKind] = useState<PromotionKind>("two_for_one");
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ productId: string; name: string; qty: number }[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [percent, setPercent] = useState("50");
  const [n, setN] = useState("2");
  const [combo, setCombo] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const found = useQuery({
    queryKey: ["promo-search", search],
    queryFn: () => fetchProducts({ q: search, limit: 6 }),
    enabled: search.length > 1,
  });
  const usesCategory = kind === "category_percent" || kind === "weekday";
  const save = useMutation({
    mutationFn: () =>
      api("/api/promotions", {
        body: {
          name:
            name.trim() ||
            `${PROMO_LABEL[kind]} ${picked.map((p) => p.name).join(", ")}`.slice(0, 80),
          kind,
          params: {
            ...(kind === "nth_unit"
              ? { n: Number(n), percentBp: Math.round(Number(percent) * 100) }
              : {}),
            ...(usesCategory ? { percentBp: Math.round(Number(percent) * 100) } : {}),
            ...(kind === "combo"
              ? {
                  comboPriceCents: Math.round(
                    Number(combo.replace(/\./g, "").replace(",", ".")) * 100,
                  ),
                }
              : {}),
          },
          categoryId: usesCategory && categoryId ? categoryId : null,
          products: picked.map((p) => ({ productId: p.productId, qty: p.qty })),
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          weekdays: days.length ? days : null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["promotions"] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "No se pudo guardar."),
  });
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title="Nueva promoción"
      footer={
        <Button className="flex-1" onClick={() => save.mutate()} disabled={save.isPending}>
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PROMO_LABEL) as PromotionKind[]).map((k) => (
            <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
              {PROMO_LABEL[k]}
            </FilterChip>
          ))}
        </div>
        <TextField
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Se arma solo si lo dejás vacío"
        />
        {kind === "nth_unit" && (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Qué unidad"
              inputMode="numeric"
              value={n}
              onChange={(e) => setN(e.target.value)}
              hint="2 = la segunda"
            />
            <TextField
              label="Descuento %"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
        )}
        {usesCategory && (
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Categoría"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Solo los productos elegidos</option>
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
            <TextField
              label="Descuento %"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
        )}
        {kind === "combo" && (
          <TextField
            label="Precio del combo"
            inputMode="decimal"
            value={combo}
            onChange={(e) => setCombo(e.target.value)}
            placeholder="5900"
          />
        )}
        <TextField
          label="Agregar producto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nombre o código"
        />
        {(found.data?.items ?? []).length > 0 && search.length > 1 && (
          <ul className="m-0 list-none rounded-lg border border-borde p-1">
            {found.data?.items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-2 text-left hover:bg-neutro-suave"
                  onClick={() => {
                    setPicked((x) => [
                      ...x.filter((y) => y.productId !== p.id),
                      { productId: p.id, name: p.name, qty: 1 },
                    ]);
                    setSearch("");
                  }}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <button
              key={p.productId}
              type="button"
              onClick={() => setPicked((x) => x.filter((y) => y.productId !== p.productId))}
            >
              <Chip size="md">{p.name} ✕</Chip>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Desde"
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
          <TextField
            label="Hasta"
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </div>
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="Días">
          {DAYS.map((d, i) => (
            <FilterChip
              key={d}
              active={days.includes(i)}
              onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}
            >
              {d}
            </FilterChip>
          ))}
        </fieldset>
        {error && (
          <div role="alert" className="text-sm font-semibold text-peligro">
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Promociones por estado: activa, programada y terminada. */
export function PromotionsPage() {
  const can = useCan("change_prices");
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ["promotions"], queryFn: () => api<Promo[]>("/api/promotions") });
  const today = todayAR();
  if (!can) return <NoPermissionFor perm="change_prices" />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <h1 className="m-0 flex-1 text-[22px] font-semibold">Promociones</h1>
        <Button onClick={() => setCreating(true)}>Nueva promoción</Button>
      </div>
      {q.isPending ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          title="No hay promociones"
          body="2×1, 3×2, segunda al 50 %, combos, % por categoría o por día."
        />
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0">
          {q.data.map((p) => {
            const st = promoStatus({ ...p, products: p.products }, today);
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 border-b border-borde px-4 py-3 last:border-b-0"
              >
                <span className="flex-1">
                  <span className="font-semibold">{p.name}</span>
                  <span className="block text-[13px] text-texto-suave">
                    {PROMO_LABEL[p.kind]}
                    {p.endsOn ? ` · hasta ${formatDate(p.endsOn).slice(0, 5)}` : ""}
                    {p.weekdays?.length ? ` · ${p.weekdays.map((d) => DAYS[d]).join(" y ")}` : ""}
                  </span>
                </span>
                <Chip tone={STATUS_LABEL[st][1]}>{STATUS_LABEL[st][0]}</Chip>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <PromoForm onClose={() => setCreating(false)} />}
    </div>
  );
}
