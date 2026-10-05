import { formatDate, formatMoney, formatQty } from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan } from "../../app/session";
import { api } from "../../data/api";
import { FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import { useWide } from "../../ui/useMedia";
import { PurchasesTabs } from "./PurchasesTabs";
import { DAYS } from "./SuppliersPage";

export type SuggestedLine = {
  productId: string;
  name: string;
  unit: "unit" | "kg";
  stock: number;
  minStock: number | null;
  dailySales: number;
  onOrder: number;
  packQty: number | null;
  packName: string | null;
  suggested: number;
  packs: number | null;
  reason: "sales" | "minimum" | "shortage";
  explanation: string;
  costCents?: number | null;
};

export type SuggestedOrder = {
  supplierId: string;
  supplierName: string;
  delivery: string;
  daysToCover: number;
  minOrderCents: number | null;
  count: number;
  totalCents?: number;
  lines?: SuggestedLine[];
};

const qtyText = (q: number, unit: "unit" | "kg") => formatQty(q, unit);
const parseQty = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

/** Pedido sugerido por proveedor: tabla editable (Tab y Enter) con la cuenta explicada. */
export function SuggestedPage({
  actions,
}: {
  actions?: (o: SuggestedOrder, qty: Record<string, number>) => React.ReactNode;
}) {
  const can = useCan("build_orders");
  const wide = useWide();
  const [params, setParams] = useSearchParams();
  const summary = useQuery({
    queryKey: ["suggested"],
    queryFn: () => api<SuggestedOrder[]>("/api/purchasing/suggested"),
    enabled: can,
  });
  const withLines = (summary.data ?? []).filter((o) => o.count > 0);
  const supplierId = params.get("proveedor") ?? withLines[0]?.supplierId ?? null;
  const detail = useQuery({
    queryKey: ["suggested", supplierId],
    queryFn: () => api<SuggestedOrder[]>(`/api/purchasing/suggested?supplierId=${supplierId}`),
    enabled: can && !!supplierId,
  });
  const order = detail.data?.[0];
  const [qty, setQty] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!order?.lines) return;
    setQty(
      Object.fromEntries(
        order.lines.map((l) => [l.productId, String(l.suggested).replace(".", ",")]),
      ),
    );
    setFocus(order.lines[0]?.productId ?? null);
  }, [order]);

  if (!can) return <NoPermissionFor perm="build_orders" />;
  const lines = order?.lines ?? [];
  const n = (id: string) => parseQty(qty[id] ?? "0");
  const costs = lines.some((l) => l.costCents !== undefined);
  const total = lines.reduce((s, l) => s + Math.round((l.costCents ?? 0) * n(l.productId)), 0);
  const packs = lines.reduce(
    (s, l) => s + (l.packQty ? Math.ceil(n(l.productId) / l.packQty) : 0),
    0,
  );
  const focused = lines.find((l) => l.productId === focus);
  const reachesMin = order?.minOrderCents == null || total >= order.minOrderCents;
  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const next = document.querySelector<HTMLInputElement>(`[data-sug-row="${i + 1}"]`);
    next?.focus();
    next?.select();
  };

  const qtyInput = (l: SuggestedLine, i: number) => (
    <input
      aria-label={`Pedir ${l.name}`}
      data-sug-row={i}
      inputMode="decimal"
      value={qty[l.productId] ?? ""}
      onFocus={(e) => {
        setFocus(l.productId);
        e.currentTarget.select();
      }}
      onChange={(e) =>
        setQty((q) => ({
          ...q,
          [l.productId]: e.target.value.replace(/[^\d,]/g, ""),
        }))
      }
      onKeyDown={(e) => onEnter(e, i)}
      className={cx(
        "tnum w-20 rounded-md border border-borde-fuerte bg-superficie px-2 text-right font-semibold",
        wide ? "h-9" : "h-11 text-base",
      )}
    />
  );
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold">Compras</h1>
        <PurchasesTabs />
      </div>
      {summary.isPending ? (
        <SkeletonList />
      ) : summary.isError ? (
        <ErrorState onRetry={() => summary.refetch()} />
      ) : !withLines.length ? (
        <EmptyState
          title="No hace falta pedir nada"
          body="Ningún producto está debajo del mínimo ni se queda corto antes de la próxima entrega."
        />
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Proveedores">
            {withLines.map((o) => (
              <FilterChip
                key={o.supplierId}
                active={o.supplierId === supplierId}
                onClick={() => setParams({ proveedor: o.supplierId })}
              >
                {o.supplierName} · {o.count}
              </FilterChip>
            ))}
          </nav>
          {detail.isPending || !order ? (
            <SkeletonList />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
              <section className="overflow-hidden rounded-card border border-borde bg-superficie">
                <div className="border-b border-borde px-4 py-3">
                  <h2 className="m-0 text-lg font-semibold">
                    Pedido sugerido · {order.supplierName}
                  </h2>
                  <div className="text-[13px] text-texto-suave">
                    Entrega{" "}
                    {DAYS[new Date(`${order.delivery}T12:00:00-03:00`).getDay()]?.toLowerCase()}{" "}
                    {formatDate(order.delivery).slice(0, 5)} · cubre {order.daysToCover} días
                    {order.minOrderCents != null
                      ? ` · mínimo ${formatMoney(order.minOrderCents)}`
                      : ""}
                  </div>
                </div>
                {wide ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="text-left text-xs text-texto-suave">
                          <th className="px-4 py-2 font-semibold">Producto</th>
                          <th className="px-2 py-2 text-right font-semibold">Stock</th>
                          <th className="px-2 py-2 text-right font-semibold">Venta/día</th>
                          <th className="px-2 py-2 text-right font-semibold">Sugerido</th>
                          <th className="px-2 py-2 text-right font-semibold">Pedir</th>
                          {costs && <th className="px-2 py-2 text-right font-semibold">Costo</th>}
                          {costs && (
                            <th className="px-4 py-2 text-right font-semibold">Subtotal</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l, i) => (
                          <tr
                            key={l.productId}
                            onClick={() => setFocus(l.productId)}
                            className={cx(
                              "border-t border-borde",
                              focus === l.productId && "bg-primario-suave/50",
                            )}
                          >
                            <td className="px-4 py-2">
                              <div className="font-medium">{l.name}</div>
                              {l.packQty && (
                                <div className="text-xs text-texto-suave">
                                  {(l.packName ?? "caja").toLowerCase()} de {l.packQty}
                                </div>
                              )}
                            </td>
                            <td
                              className={cx(
                                "tnum px-2 text-right",
                                l.stock <= 0 && "font-semibold text-peligro",
                              )}
                            >
                              {qtyText(l.stock, l.unit)}
                            </td>
                            <td className="tnum px-2 text-right">
                              {String(Math.round(l.dailySales * 10) / 10).replace(".", ",")}
                            </td>
                            <td className="tnum px-2 text-right text-texto-suave">
                              {qtyText(l.suggested, l.unit)}
                            </td>
                            <td className="px-2 text-right">{qtyInput(l, i)}</td>
                            {costs && (
                              <td className="tnum px-2 text-right">
                                {l.costCents != null ? formatMoney(l.costCents) : "—"}
                              </td>
                            )}
                            {costs && (
                              <td className="tnum px-4 text-right font-semibold whitespace-nowrap">
                                {formatMoney(Math.round((l.costCents ?? 0) * n(l.productId)))}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <ul className="m-0 list-none p-0" aria-label="Productos del pedido">
                    {lines.map((l, i) => (
                      <li
                        key={l.productId}
                        className={cx(
                          "flex items-center gap-3 border-t border-borde px-4 py-2.5",
                          focus === l.productId && "bg-primario-suave/50",
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setFocus(l.productId)}
                        >
                          <span className="block font-medium">{l.name}</span>
                          <span className="block text-xs text-texto-suave">
                            stock {qtyText(l.stock, l.unit)} · vende{" "}
                            {String(Math.round(l.dailySales * 10) / 10).replace(".", ",")}/día
                            {l.packQty
                              ? ` · ${(l.packName ?? "caja").toLowerCase()} de ${l.packQty}`
                              : ""}
                            {costs && l.costCents != null ? ` · ${formatMoney(l.costCents)}` : ""}
                          </span>
                        </button>
                        {qtyInput(l, i)}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-3 border-t border-borde px-4 py-3 text-sm">
                  <span className="flex-1 text-texto-suave">
                    {wide ? "Tab y Enter para moverte" : ""}
                  </span>
                  {costs && (
                    <span>
                      Total <strong className="tnum text-base">{formatMoney(total)}</strong>
                    </span>
                  )}
                </div>
              </section>
              <aside className="flex flex-col gap-3">
                {focused && (
                  <section
                    aria-label="La cuenta"
                    className="rounded-card border border-borde bg-superficie p-4 text-sm"
                  >
                    <div className="mb-1 font-semibold">{focused.name} · la cuenta</div>
                    <p className="m-0" aria-live="polite">
                      {focused.explanation}
                    </p>
                    <p className="m-0 mt-2 text-xs text-texto-suave">
                      pedido = venta diaria × días a cubrir − stock − ya pedido, redondeado al bulto
                    </p>
                  </section>
                )}
                <section className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-4 text-sm">
                  <div className="text-texto-suave">
                    {lines.length} productos{packs ? ` · ${packs} bultos` : ""}
                  </div>
                  {costs && (
                    <>
                      <div className="flex items-baseline justify-between">
                        <span>Total estimado</span>
                        <strong className="tnum text-xl">{formatMoney(total)}</strong>
                      </div>
                      {order.minOrderCents != null && (
                        <div
                          className={cx(
                            "flex items-center gap-1.5 font-semibold",
                            reachesMin ? "text-exito" : "text-alerta",
                          )}
                        >
                          {reachesMin ? (
                            <CircleCheck size={16} aria-hidden />
                          ) : (
                            <CircleAlert size={16} aria-hidden />
                          )}
                          {reachesMin
                            ? `Supera el mínimo de ${formatMoney(order.minOrderCents)}`
                            : `Falta ${formatMoney(order.minOrderCents - total)} para el mínimo`}
                        </div>
                      )}
                    </>
                  )}
                  {actions?.(
                    order,
                    Object.fromEntries(lines.map((l) => [l.productId, n(l.productId)])),
                  )}
                </section>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
