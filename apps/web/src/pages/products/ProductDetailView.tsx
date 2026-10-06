import { formatDate, formatMoney, formatPercent, formatQty, formatTime } from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Star } from "lucide-react";
import { useState } from "react";
import { useCan } from "../../app/session";
import { fetchProduct, type ProductDetail } from "../../data/products";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { ErrorState, Skeleton } from "../../ui/States";
import { Tabs } from "../../ui/Tabs";
import { AdjustStockSheet } from "./AdjustStockSheet";
import { ProductChips, StockChip } from "./StockChip";
import {
  type SupplierLink,
  SupplierLinkSheet,
  useCanLinkSuppliers,
  useSupplierLinkActions,
} from "./SupplierLinkSheet";

type Tab = "general" | "precio" | "stock" | "proveedores" | "historial";

const MOVE_LABEL: Record<string, string> = {
  sale: "Venta",
  return: "Devolución",
  receipt: "Recepción",
  adjustment: "Ajuste",
  waste: "Merma",
  count: "Conteo",
  void: "Anulación",
};

const ACTION_LABEL: Record<string, string> = {
  "product.created": "Alta",
  "product.updated": "Cambio",
  "product.price_changed": "Cambio de precio",
  "product.deleted": "Baja",
  "product.barcode_added": "Código agregado",
  "product.barcode_removed": "Código quitado",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t border-borde py-2">
      <span className="text-texto-suave">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** Mini gráfico de costo y precio en el tiempo (sale del historial). */
function PriceChart({ p }: { p: ProductDetail }) {
  const points = [...p.history]
    .reverse()
    .filter((h) => h.after && ("priceCents" in h.after || "costCents" in h.after));
  const prices: number[] = [];
  const costs: number[] = [];
  let lastPrice = (points[0]?.before?.priceCents as number | undefined) ?? p.priceCents;
  let lastCost = (points[0]?.before?.costCents as number | undefined) ?? p.costCents ?? 0;
  prices.push(lastPrice);
  costs.push(lastCost);
  for (const h of points) {
    lastPrice = (h.after?.priceCents as number | undefined) ?? lastPrice;
    lastCost = (h.after?.costCents as number | undefined) ?? lastCost;
    prices.push(lastPrice);
    costs.push(lastCost);
  }
  if (prices.length < 2)
    return (
      <div className="text-xs text-texto-suave">
        Todavía no hay cambios de precio para graficar.
      </div>
    );
  const max = Math.max(...prices, ...costs) * 1.05;
  const min = Math.min(...prices, ...costs.filter(Boolean)) * 0.9;
  const toPts = (v: number[]) =>
    v
      .map((x, i) => `${(i / (v.length - 1)) * 300},${80 - ((x - min) / (max - min || 1)) * 76}`)
      .join(" ");
  return (
    <svg
      viewBox="0 0 300 80"
      className="h-20 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Costo y precio en el tiempo"
    >
      <polyline points={toPts(prices)} fill="none" stroke="var(--primario)" strokeWidth="2" />
      {costs.some(Boolean) && (
        <polyline
          points={toPts(costs)}
          fill="none"
          stroke="var(--texto-apagado)"
          strokeWidth="2"
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}

export function ProductDetailView({
  id,
  onEdit,
  onBack,
  initialAdjust,
}: {
  id: string;
  initialAdjust?: boolean;
  onEdit: (p: ProductDetail) => void;
  onBack?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const seeCosts = useCan("view_costs");
  const canEdit = useCan("change_prices");
  const canAdjust = useCan("adjust_stock");
  const [adjust, setAdjust] = useState(initialAdjust ?? false);
  const canLink = useCanLinkSuppliers();
  const actions = useSupplierLinkActions();
  const [link, setLink] = useState<{ link: SupplierLink | null } | null>(null);
  const q = useQuery({ queryKey: ["product", id], queryFn: () => fetchProduct(id) });
  if (q.isPending) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-14" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (q.isError)
    return <ErrorState message="No pudimos abrir la ficha." onRetry={() => q.refetch()} />;
  const p = q.data;
  const unit = p.saleUnit === "unit" ? "unit" : "kg";
  const primary = p.suppliers.find((s) => s.isPrimary) ?? p.suppliers[0];
  const lastChange = p.history.find((h) => h.action === "product.price_changed");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start gap-3 px-4 pt-4 lg:px-[18px]">
        {onBack && (
          <button
            type="button"
            aria-label="Volver"
            onClick={onBack}
            className="-ml-2 inline-flex size-12 items-center justify-center"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div
          className="size-14 shrink-0 rounded-lg bg-[repeating-linear-gradient(135deg,var(--neutro-suave)_0_6px,var(--borde)_6px_12px)]"
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-base font-semibold">{p.name}</h2>
          <div className="text-xs text-texto-suave">
            {[p.categoryName, p.barcodes[0] ?? (p.internalCode ? `PLU ${p.internalCode}` : null)]
              .filter(Boolean)
              .join(" · ")}
          </div>
          <div className="flex flex-wrap gap-1">
            <StockChip p={p} />
            <ProductChips p={p} />
          </div>
        </div>
      </div>
      <Tabs
        className="mt-3.5 px-4 lg:px-[18px]"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "general", label: "General" },
          { id: "precio", label: "Precio" },
          { id: "stock", label: "Stock" },
          { id: "proveedores", label: "Proveedores" },
          { id: "historial", label: "Historial" },
        ]}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5 text-[13px] lg:px-[18px]">
        {tab === "general" && (
          <div>
            <Row label="Tipo">
              {p.kind === "service"
                ? "Servicio"
                : p.saleUnit === "kg"
                  ? "Pesable (por kilo)"
                  : "Por unidad"}
            </Row>
            <Row label="Códigos de barras">
              {p.barcodes.length ? p.barcodes.join(", ") : "Sin código"}
            </Row>
            <Row label="Código interno">{p.internalCode ?? "—"}</Row>
            <Row label="Ubicación">{p.location ?? "—"}</Row>
            <Row label="Restricción">{p.ageRestricted ? "Mayores de 18" : "Ninguna"}</Row>
            {p.purchaseUnitName && (
              <Row label="Unidad de compra">
                {p.purchaseUnitName} × {formatQty(p.purchaseUnitQty ?? 1)}
              </Row>
            )}
            {p.linked.length > 0 && (
              <Row label="Presentaciones vinculadas">
                {p.linked.map((l) => `${l.name} (× ${formatQty(l.factor)})`).join(", ")}
              </Row>
            )}
            {p.stockBaseId && (
              <Row label="Comparte stock">
                Sí, con su producto base (× {formatQty(p.stockBaseFactor ?? 1)})
              </Row>
            )}
            {p.kind === "service" && p.commissionBp != null && (
              <Row label="Comisión">{formatPercent(p.commissionBp, { decimals: 1 })}</Row>
            )}
          </div>
        )}
        {tab === "precio" && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {seeCosts && (
                <div className="flex flex-col gap-0.5 rounded-lg border border-borde px-3 py-2.5">
                  <span className="text-xs text-texto-suave">Costo último</span>
                  <span className="text-lg font-semibold">
                    {p.costCents != null ? formatMoney(p.costCents) : "Sin costo"}
                  </span>
                  {p.avgCostCents != null && (
                    <span className="text-[11px] text-texto-suave">
                      promedio {formatMoney(p.avgCostCents)}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-0.5 rounded-lg border border-borde px-3 py-2.5">
                <span className="text-xs text-texto-suave">
                  Precio de venta{unit === "kg" ? " (kg)" : ""}
                </span>
                <span className="text-lg font-semibold">{formatMoney(p.priceCents)}</span>
                {seeCosts && p.marginBp != null && (
                  <span
                    className={`text-[11px] font-semibold ${p.marginBp < 0 ? "text-peligro" : "text-exito"}`}
                  >
                    {formatPercent(p.marginBp)} de ganancia
                  </span>
                )}
              </div>
            </div>
            <div className="flex justify-between text-xs text-texto-suave">
              <span>Costo y precio</span>
            </div>
            <PriceChart p={p} />
            <div>
              <Row label="IVA">{formatPercent(p.vatBp, { decimals: 1 })} · para fase 2</Row>
              <Row label="Precio fijo">
                {p.fixedPrice
                  ? "Sí · queda afuera del cambio masivo"
                  : "No · entra al cambio masivo"}
              </Row>
              {primary && (
                <Row label="Proveedor principal">
                  {primary.name}
                  {primary.supplierCode ? ` · ${primary.supplierCode}` : ""}
                </Row>
              )}
              {lastChange && (
                <Row label="Último cambio">
                  {formatDate(new Date(lastChange.createdAt)).slice(0, 5)}
                </Row>
              )}
            </div>
          </>
        )}
        {tab === "stock" && (
          <>
            <div>
              <Row label="Stock">{formatQty(p.stockQty, unit)}</Row>
              <Row label="Mínimo">{p.minStock != null ? formatQty(p.minStock, unit) : "—"}</Row>
              {p.lots.map((l) => (
                <Row key={l.id} label={`Lote ${l.code ?? ""}`.trim()}>
                  {formatQty(l.qtyRemaining, unit)} · vence {formatDate(l.expiresOn)}
                </Row>
              ))}
            </div>
            <div className="mt-2 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Movimientos
            </div>
            {p.movements.length === 0 && (
              <div className="text-texto-suave">Sin movimientos todavía.</div>
            )}
            {p.movements.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 border-t border-borde py-2"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {MOVE_LABEL[m.kind] ?? m.kind}
                    {m.status === "pending" ? " · para aprobar" : ""}
                  </span>
                  <span className="text-xs text-texto-suave">
                    {formatDate(new Date(m.createdAt))} {formatTime(new Date(m.createdAt))}
                    {m.reason ? ` · ${m.reason}` : ""}
                  </span>
                </div>
                <span className={`tnum font-semibold ${m.qty < 0 ? "text-peligro" : "text-exito"}`}>
                  {m.qty > 0 ? "+" : "−"}
                  {formatQty(Math.abs(m.qty), unit)}
                </span>
              </div>
            ))}
          </>
        )}
        {tab === "proveedores" && (
          <>
            {p.suppliers.length ? (
              <ul className="m-0 list-none p-0" aria-label="Proveedores del producto">
                {p.suppliers.map((s) => (
                  <li
                    key={s.supplierId}
                    className="flex flex-col gap-1.5 border-t border-borde py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex flex-wrap items-center gap-1.5 font-medium">
                          {s.name}
                          {s.isPrimary && (
                            <Chip tone="primario" icon={Star}>
                              Principal
                            </Chip>
                          )}
                        </span>
                        <span className="text-xs text-texto-suave">
                          {[
                            s.supplierCode ? `Código ${s.supplierCode}` : "Sin código",
                            s.packQty != null ? `bulto × ${formatQty(s.packQty)}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      {seeCosts && (
                        <span className="tnum shrink-0 font-semibold">
                          {s.costCents != null ? formatMoney(s.costCents) : "Sin costo"}
                        </span>
                      )}
                    </div>
                    {canLink && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setLink({
                              link: {
                                ...s,
                                productId: p.id,
                                supplierName: s.name,
                                productName: p.name,
                              },
                            })
                          }
                        >
                          Editar
                        </Button>
                        {!s.isPrimary && (
                          <Button
                            variant="ghost"
                            disabled={actions.save.isPending}
                            onClick={() =>
                              actions.makePrimary({
                                ...s,
                                productId: p.id,
                                supplierName: s.name,
                              })
                            }
                          >
                            Hacer principal
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-texto-suave">
                Sin proveedor cargado.
                {canLink ? " Agregá a quién se lo comprás para armar los pedidos." : ""}
              </div>
            )}
            {canLink && (
              <Button
                variant="secondary"
                className="self-start"
                onClick={() => setLink({ link: null })}
              >
                Agregar proveedor
              </Button>
            )}
          </>
        )}
        {tab === "historial" &&
          (p.history.length ? (
            p.history.map((h) => (
              <div key={h.id} className="flex flex-col gap-0.5 border-t border-borde py-2">
                <span className="font-medium">{ACTION_LABEL[h.action] ?? h.action}</span>
                <span className="text-xs text-texto-suave">
                  {formatDate(new Date(h.createdAt))} {formatTime(new Date(h.createdAt))}
                  {h.after && "priceCents" in h.after && h.before
                    ? ` · ${formatMoney(Number(h.before.priceCents))} → ${formatMoney(Number(h.after.priceCents))}`
                    : ""}
                  {h.note ? ` · ${h.note}` : ""}
                </span>
              </div>
            ))
          ) : (
            <div className="text-texto-suave">Sin cambios registrados.</div>
          ))}
      </div>
      {(canEdit || canAdjust) && (
        <div className="grid grid-cols-2 gap-2 border-t border-borde px-4 py-3.5 lg:px-[18px]">
          {canAdjust && p.kind !== "service" && (
            <Button variant="secondary" onClick={() => setAdjust(true)}>
              Ajustar stock
            </Button>
          )}
          {canEdit && <Button onClick={() => onEdit(p)}>Editar</Button>}
        </div>
      )}
      {adjust && <AdjustStockSheet productId={p.id} onClose={() => setAdjust(false)} />}
      {link && (
        <SupplierLinkSheet
          from="product"
          productId={p.id}
          link={link.link}
          firstLink={p.suppliers.length === 0}
          takenIds={p.suppliers.map((s) => s.supplierId)}
          onClose={() => setLink(null)}
        />
      )}
    </div>
  );
}
