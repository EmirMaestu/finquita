import { type BulkRow, formatMoney, formatPercent } from "@mostrador/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { fetchCategories } from "../../data/products";
import { useSyncStatus } from "../../sync/status";
import { Button } from "../../ui/Button";
import { FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { SelectField, TextField } from "../../ui/Field";
import { OfflineBanner } from "../../ui/States";
import { Steps } from "../../ui/Steps";

type Mode = "price_pct" | "cost_pct" | "recalc";
type Preview = {
  rows: BulkRow[];
  summary: { changed: number; skipped: number; avgChangeBp: number };
};

const ROUNDINGS = [
  [1000, "$ 10"],
  [5000, "$ 50"],
  [10000, "$ 100"],
] as const;

/** Cambio masivo: filtrar → ajuste → redondeo → vista previa → confirmar → etiquetas. */
export function BulkPricePage() {
  const can = useCan("change_prices");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ids = params.get("ids")?.split(",").filter(Boolean);
  const { online } = useSyncStatus();
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const suppliers = useQuery({
    queryKey: ["suppliers-light"],
    queryFn: () => api<{ id: string; name: string }[]>("/api/suppliers?light=1").catch(() => []),
  });
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [mode, setMode] = useState<Mode>("price_pct");
  const [pct, setPct] = useState("7");
  const [rounding, setRounding] = useState<number>(5000);
  const [error, setError] = useState<string | null>(null);
  const body = () => ({
    ...(ids?.length ? { ids } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(supplierId ? { supplierId } : {}),
    mode,
    percentBp: Math.round(Number(pct.replace(",", ".") || "0") * 100),
    roundingCents: rounding,
  });
  const preview = useMutation({
    mutationFn: () => api<Preview>("/api/prices/preview", { body: body() }),
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "No se pudo armar la vista previa."),
  });
  const apply = useMutation({
    mutationFn: () => api<{ changedIds: string[] }>("/api/prices/apply", { body: body() }),
    onError: (e) => setError(e instanceof ApiError ? e.message : "No se pudo aplicar."),
  });
  if (!can) return <NoPermissionFor perm="change_prices" />;
  const step = apply.data ? 3 : preview.data ? 2 : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-[22px] font-semibold">Cambio masivo de precios</h1>
        <Steps steps={["Elegir", "Vista previa", "Confirmar", "Etiquetas"]} current={step} />
      </div>
      {!online && <OfflineBanner>El cambio masivo necesita internet.</OfflineBanner>}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-peligro-suave px-3 py-2 text-sm font-semibold text-peligro"
        >
          {error}
        </div>
      )}
      {!apply.data && (
        <section
          aria-label="Qué productos y cuánto"
          className="grid grid-cols-1 gap-4 rounded-card border border-borde bg-superficie p-5 lg:grid-cols-2"
        >
          {ids?.length ? (
            <div className="text-sm lg:col-span-2">
              <strong>{ids.length}</strong> productos elegidos en la lista.
            </div>
          ) : (
            <>
              <SelectField
                label="Categoría"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Todas</option>
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
              <SelectField
                label="Proveedor"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Todos</option>
                {(suppliers.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </SelectField>
            </>
          )}
          <div className="flex flex-col gap-2 lg:col-span-2">
            <span className="text-[13px] font-semibold">Qué cambia</span>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={mode === "price_pct"} onClick={() => setMode("price_pct")}>
                % al precio
              </FilterChip>
              <FilterChip active={mode === "cost_pct"} onClick={() => setMode("cost_pct")}>
                % al costo
              </FilterChip>
              <FilterChip active={mode === "recalc"} onClick={() => setMode("recalc")}>
                Recalcular desde el costo
              </FilterChip>
            </div>
          </div>
          {mode !== "recalc" && (
            <TextField
              label="Porcentaje"
              inputMode="decimal"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              hint="Con signo menos baja: −5"
            />
          )}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold">Redondeo</span>
            <div className="flex gap-2">
              {ROUNDINGS.map(([v, label]) => (
                <FilterChip key={v} active={rounding === v} onClick={() => setRounding(v)}>
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>
          <Button
            className="self-end lg:col-span-2 lg:justify-self-start"
            onClick={() => preview.mutate()}
            disabled={!online || preview.isPending}
          >
            Ver vista previa
          </Button>
        </section>
      )}

      {preview.data && !apply.data && (
        <section
          aria-label="Vista previa"
          className="flex flex-col gap-3 rounded-card border border-borde bg-superficie p-5"
        >
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              <strong>{preview.data.summary.changed}</strong> precios cambian, en promedio{" "}
              {formatPercent(preview.data.summary.avgChangeBp, { sign: true, decimals: 1 })}
            </span>
            {preview.data.summary.skipped > 0 && (
              <span className="text-texto-suave">
                {preview.data.summary.skipped} quedan afuera (precio fijo o sin costo)
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="h-8 border-b border-borde text-left text-xs font-semibold text-texto-suave">
                <th className="font-semibold">Producto</th>
                <th className="text-right font-semibold">Antes</th>
                <th className="text-right font-semibold">Después</th>
                <th className="text-right font-semibold">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {preview.data.rows.map((r) => (
                <tr
                  key={r.id}
                  className={cx("h-10 border-b border-borde", r.skipped && "text-texto-apagado")}
                >
                  <td>
                    {r.name}
                    {r.skipped ? <span className="ml-2 text-xs">· {r.skipped}</span> : null}
                  </td>
                  <td className="tnum text-right">{formatMoney(r.beforeCents)}</td>
                  <td
                    className={cx(
                      "tnum text-right font-semibold",
                      r.afterCents > r.beforeCents
                        ? ""
                        : r.afterCents < r.beforeCents
                          ? "text-exito"
                          : "",
                    )}
                  >
                    {formatMoney(r.afterCents)}
                  </td>
                  <td
                    className={cx(
                      "tnum text-right",
                      r.marginAfterBp !== null && r.marginAfterBp < 0 && "text-peligro",
                    )}
                  >
                    {r.marginAfterBp !== null ? formatPercent(r.marginAfterBp) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => preview.reset()}>
              Atrás
            </Button>
            <Button
              onClick={() => apply.mutate()}
              disabled={!online || apply.isPending || !preview.data.summary.changed}
            >
              Confirmar {preview.data.summary.changed} precios
            </Button>
          </div>
        </section>
      )}

      {apply.data && (
        <section
          aria-label="Listo"
          className="flex flex-col items-start gap-3 rounded-card border border-borde bg-superficie p-5"
        >
          <div className="text-lg font-semibold">
            Listo: cambiaron {apply.data.changedIds.length} precios
          </div>
          <div className="text-sm text-texto-suave">¿Imprimís las etiquetas de lo que cambió?</div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/productos")}>
              Ahora no
            </Button>
            <Button
              onClick={() =>
                navigate(`/productos/etiquetas?ids=${apply.data.changedIds.join(",")}`)
              }
            >
              Imprimir etiquetas
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
