import {
  costChange,
  formatDate,
  formatMoney,
  formatQty,
  orderNumber,
  parseMoney,
  receiptSummary,
  roundQty,
} from "@mostrador/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, CircleCheck, PackageCheck, ScanBarcode, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan, useGrant, useMe } from "../../app/session";
import { api } from "../../data/api";
import { findByCode } from "../../data/catalog";
import { localDb } from "../../data/db";
import { queuePhoto } from "../../data/files";
import { useLive } from "../../data/live";
import { confirmReceiptLocal } from "../../data/receive";
import { useSettings } from "../../data/settings";
import { beep } from "../../scan/beep";
import { scanRouter } from "../../scan/GlobalScan";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";
import { PurchasesTabs } from "./PurchasesTabs";

type Expected = {
  id: string;
  number: number;
  status: string;
  expectedOn: string | null;
  supplierId: string;
  supplierName: string;
};
type OrderData = {
  id: string;
  number: number;
  expectedOn: string | null;
  supplier: { id: string; name: string };
  lines: {
    orderLineId: string;
    productId: string;
    name: string;
    unit: "unit" | "kg";
    ordered: number;
    alreadyReceived: number;
    tracksExpiry: boolean;
    barcodes: string[];
    priceCents: number;
    costCents?: number | null;
    marginBp?: number;
  }[];
};

type Line = {
  key: string;
  productId: string;
  orderLineId: string | null;
  name: string;
  unit: "unit" | "kg";
  /** Lo que falta recibir del pedido (null si llegó sin pedir). */
  ordered: number | null;
  tracksExpiry: boolean;
  priceCents: number;
  previousCostCents: number | null;
  marginBp: number | null;
  received: string;
  damaged: string;
  lotCode: string;
  expiresOn: string;
  cost: string;
  newPriceCents: number | null;
  /** "Después": queda con el chip "Revisar precio". */
  later: boolean;
};

const num = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const qtyText = (n: number, unit: "unit" | "kg") => formatQty(n, unit);
const centsText = (c: number | null) => (c == null ? "" : String(c / 100).replace(".", ","));

/** Pantalla de entrada: recepciones esperadas, sin pedido o en mayorista. */
function Start() {
  const navigate = useNavigate();
  const costs = useGrant("view_costs") === "allow";
  const expected = useQuery({
    queryKey: ["receipts-expected"],
    queryFn: () => api<Expected[]>("/api/receipts/expected"),
  });
  const pending = useQuery({
    queryKey: ["receipts-costs"],
    queryFn: () =>
      api<
        {
          id: string;
          supplierName: string | null;
          orderNumber: number | null;
          by: string | null;
          receivedAt: string;
        }[]
      >("/api/receipts?costsPending=1"),
    enabled: costs,
  });
  const suppliers = useLive(
    async () =>
      (await localDb().suppliers.toArray()).filter((s) => !s.deletedAt) as {
        id: string;
        name: string;
        channel?: string;
      }[],
    [],
    [],
  );
  const [supplier, setSupplier] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="Recepciones esperadas"
        className="overflow-hidden rounded-card border border-borde bg-superficie"
      >
        <div className="border-b border-borde px-4 py-2.5 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
          Recepciones esperadas
        </div>
        {expected.isPending ? (
          <SkeletonList rows={2} className="p-3" />
        ) : expected.isError ? (
          <div className="p-4 text-sm text-texto-suave">
            Los pedidos se ven con conexión. Igual podés recibir sin pedido.
          </div>
        ) : !expected.data.length ? (
          <div className="p-4 text-sm text-texto-suave">No hay pedidos en camino.</div>
        ) : (
          expected.data.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => navigate(`/compras/recepcion?pedido=${o.id}`)}
              className="flex min-h-14 w-full items-center gap-3 border-b border-borde px-4 py-3 text-left last:border-b-0"
            >
              <PackageCheck size={22} className="text-primario" aria-hidden />
              <span className="flex-1">
                <span className="font-semibold">
                  Pedido {orderNumber(o.number)} · {o.supplierName}
                </span>
                <span className="block text-[13px] text-texto-suave">
                  {o.expectedOn ? `Entrega ${formatDate(o.expectedOn).slice(0, 5)}` : "Sin fecha"}
                </span>
              </span>
              <span className="font-semibold text-primario">Recibir</span>
            </button>
          ))
        )}
      </section>
      <section
        aria-label="Sin pedido"
        className="flex flex-col gap-3 rounded-card border border-borde bg-superficie p-4"
      >
        <div className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
          Sin pedido
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Proveedor
          <select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            className="h-12 rounded-lg border border-borde-fuerte bg-superficie px-3 text-base"
          >
            <option value="">Elegí</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!supplier}
            onClick={() => navigate(`/compras/recepcion?proveedor=${supplier}&tipo=no_order`)}
          >
            Recibir sin pedido
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              navigate(
                `/compras/recepcion?tipo=wholesale${supplier ? `&proveedor=${supplier}` : ""}`,
              )
            }
          >
            Compra en mayorista
          </Button>
        </div>
      </section>
      {costs && !!pending.data?.length && (
        <section
          aria-label="Para completar costos"
          className="overflow-hidden rounded-card border border-borde bg-superficie"
        >
          <div className="border-b border-borde px-4 py-2.5 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
            Para completar costos
          </div>
          {pending.data.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(`/compras/recepcion/${r.id}/costos`)}
              className="flex w-full items-center gap-3 border-b border-borde px-4 py-3 text-left last:border-b-0"
            >
              <span className="flex-1">
                <span className="font-semibold">
                  {r.orderNumber ? `Pedido ${orderNumber(r.orderNumber)}` : "Sin pedido"} ·{" "}
                  {r.supplierName ?? "—"}
                </span>
                <span className="block text-[13px] text-texto-suave">
                  Recibió {r.by ?? "—"} · {formatDate(new Date(r.receivedAt)).slice(0, 5)}
                </span>
              </span>
              <Chip tone="alerta">Faltan costos</Chip>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

/** Aviso de costo que cambió, con el precio sugerido. */
function CostNotice({
  line,
  rounding,
  onUpdate,
  onLater,
}: {
  line: Line;
  rounding: number;
  onUpdate: (p: number) => void;
  onLater: () => void;
}) {
  const ch = costChange({
    previousCostCents: line.previousCostCents,
    costCents: line.cost ? parseMoney(line.cost) : null,
    priceCents: line.priceCents,
    marginBp: line.marginBp ?? 4000,
    roundingCents: rounding,
  });
  if (!ch) return null;
  const decided = line.newPriceCents != null || line.later;
  return (
    <div
      role="status"
      className={cx(
        "flex flex-col gap-2 rounded-lg border p-3 text-sm",
        ch.up ? "border-alerta bg-alerta-suave" : "border-borde bg-neutro-suave",
      )}
    >
      <div className="flex items-start gap-2 font-semibold">
        <TriangleAlert size={18} className="shrink-0 text-alerta" aria-hidden />
        {ch.text}
      </div>
      <div>{ch.priceText}</div>
      {decided ? (
        <div className="font-semibold text-texto-suave">
          {line.newPriceCents != null
            ? `Precio nuevo: ${formatMoney(line.newPriceCents)}`
            : 'Queda con "Revisar precio"'}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onUpdate(ch.suggestedPriceCents)}>Actualizar precio</Button>
          <Button variant="secondary" onClick={onLater}>
            Después · "Revisar precio"
          </Button>
        </div>
      )}
    </div>
  );
}

function Receiving({
  order,
  supplierId,
  kind,
}: {
  order: OrderData | null;
  supplierId: string | null;
  kind: "order" | "no_order" | "wholesale";
}) {
  const me = useMe();
  const navigate = useNavigate();
  const settings = useSettings();
  const costs = useGrant("view_costs") === "allow";
  const [lines, setLines] = useState<Line[]>(() =>
    (order?.lines ?? []).map((l) => ({
      key: l.orderLineId,
      productId: l.productId,
      orderLineId: l.orderLineId,
      name: l.name,
      unit: l.unit,
      ordered: Math.max(0, roundQty(l.ordered - l.alreadyReceived)),
      tracksExpiry: l.tracksExpiry,
      priceCents: l.priceCents,
      previousCostCents: l.costCents ?? null,
      marginBp: l.marginBp ?? null,
      received: "",
      damaged: "",
      lotCode: "",
      expiresOn: "",
      cost: costs ? centsText(l.costCents ?? null) : "",
      newPriceCents: null,
      later: false,
    })),
  );
  const [active, setActive] = useState<string | null>(null);
  const [extras, setExtras] = useState<Record<string, { damaged: boolean; lot: boolean }>>({});
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [summary, setSummary] = useState(false);
  const [search, setSearch] = useState("");
  const qtyRef = useRef<HTMLInputElement>(null);
  const codes = useMemo(
    () =>
      new Map(
        (order?.lines ?? []).flatMap((l) => l.barcodes.map((c) => [c, l.orderLineId] as const)),
      ),
    [order],
  );

  const set = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const activate = (key: string) => {
    setActive(key);
    setTimeout(() => {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    }, 50);
  };
  const addProduct = async (productId: string) => {
    const existing = lines.find((l) => l.productId === productId);
    if (existing) return activate(existing.key);
    const p = await localDb().products.get(productId);
    if (!p) return;
    const key = `x-${productId}`;
    let margin: number | null = null;
    if (costs)
      margin =
        (
          await api<Record<string, number>>("/api/receipts/margins", {
            body: { ids: [productId] },
          }).catch(() => ({}) as Record<string, number>)
        )[productId] ?? null;
    setLines((ls) => [
      ...ls,
      {
        key,
        productId,
        orderLineId: null,
        name: p.name,
        unit: p.saleUnit === "unit" ? "unit" : "kg",
        ordered: null,
        tracksExpiry: !!p.tracksExpiry,
        priceCents: p.priceCents,
        previousCostCents: p.costCents ?? null,
        marginBp: margin,
        received: "",
        damaged: "",
        lotCode: "",
        expiresOn: "",
        cost: costs ? centsText(p.costCents ?? null) : "",
        newPriceCents: null,
        later: false,
      },
    ]);
    activate(key);
  };

  useEffect(() => {
    return scanRouter.claim(async (code) => {
      const key = codes.get(code);
      if (key) {
        beep("ok");
        scanRouter.closeCamera();
        activate(key);
        return;
      }
      const p = await findByCode(code);
      if (!p) {
        beep("error");
        toast({ text: "Ese código no está cargado. Dalo de alta en Productos.", tone: "error" });
        return;
      }
      beep("ok");
      scanRouter.closeCamera();
      await addProduct(p.id);
    });
  });

  const found = useLive(
    async () => {
      const q = search.trim().toLowerCase();
      if (q.length < 2) return [];
      return (
        await localDb()
          .products.filter((p) => p.active !== false && p.name.toLowerCase().includes(q))
          .limit(6)
          .toArray()
      ).map((p) => ({ id: p.id, name: p.name }));
    },
    [search],
    [],
  );

  const touched = lines.filter((l) => l.received !== "");
  const act = lines.find((l) => l.key === active);
  const sum = receiptSummary(
    lines
      .filter((l) => l.ordered !== null || l.received !== "")
      .map((l) => ({
        name: l.name,
        ordered: l.ordered,
        received: num(l.received),
        damaged: num(l.damaged),
        unit: l.unit,
      })),
  );
  const confirm = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Sin sesión");
      return confirmReceiptLocal({
        memberId: me.member.id,
        kind,
        orderId: order?.id ?? null,
        supplierId: supplierId ?? order?.supplier.id ?? null,
        photoId,
        lines: touched
          .filter((l) => num(l.received) > 0)
          .map((l) => ({
            productId: l.productId,
            orderLineId: l.orderLineId,
            qty: num(l.received),
            damagedQty: Math.min(num(l.damaged), num(l.received)),
            ...(costs && l.cost ? { unitCostCents: parseMoney(l.cost) } : {}),
            ...(l.newPriceCents != null ? { newPriceCents: l.newPriceCents } : {}),
            lotCode: l.lotCode || null,
            expiresOn: l.expiresOn || null,
          })),
      });
    },
    onSuccess: () => {
      toast({ text: "Recepción confirmada: entró el stock" });
      navigate("/compras/recepcion");
    },
  });
  const tryConfirm = () => (sum.hasDifferences ? setSummary(true) : confirm.mutate());

  const lineCard = (l: Line) => {
    const rec = num(l.received);
    const missing =
      l.ordered != null && l.received !== "" && rec < l.ordered ? roundQty(l.ordered - rec) : 0;
    const ex = extras[l.key] ?? { damaged: num(l.damaged) > 0, lot: !!l.lotCode || !!l.expiresOn };
    const step = (d: number) =>
      set(l.key, { received: String(Math.max(0, roundQty(rec + d))).replace(".", ",") });
    return (
      <section
        aria-label={`Recibiendo ${l.name}`}
        className="flex flex-col gap-3 rounded-card border-2 border-primario bg-superficie p-4"
      >
        <div>
          <div className="text-lg font-semibold">{l.name}</div>
          <div className="text-[13px] text-texto-suave">
            {l.ordered != null ? `Pedido ${qtyText(l.ordered, l.unit)}` : "Llegó sin pedir"}
            {l.lotCode ? ` · lote ${l.lotCode}` : ""}
            {l.expiresOn ? ` · vence ${formatDate(l.expiresOn).slice(0, 5)}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex-1 font-semibold">Recibido</span>
          <button
            type="button"
            aria-label="Uno menos"
            onClick={() => step(-1)}
            className="size-12 rounded-full border border-borde-fuerte text-2xl"
          >
            −
          </button>
          <input
            ref={qtyRef}
            aria-label={`Recibido ${l.name}`}
            inputMode="decimal"
            value={l.received}
            placeholder={l.ordered != null ? String(l.ordered).replace(".", ",") : "0"}
            onChange={(e) => set(l.key, { received: e.target.value.replace(/[^\d,]/g, "") })}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                setActive(null);
              }
            }}
            className="tnum h-14 w-24 rounded-lg border-2 border-borde-fuerte text-center text-2xl font-semibold"
          />
          <button
            type="button"
            aria-label="Uno más"
            onClick={() => step(1)}
            className="size-12 rounded-full border border-borde-fuerte text-2xl"
          >
            +
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {missing > 0 && <Chip tone="alerta">Faltan {qtyText(missing, l.unit)}</Chip>}
          <button
            type="button"
            onClick={() => setExtras((x) => ({ ...x, [l.key]: { ...ex, damaged: !ex.damaged } }))}
          >
            <Chip size="md" tone={ex.damaged ? "peligro" : "neutro"}>
              Dañado
            </Chip>
          </button>
          <button
            type="button"
            onClick={() => setExtras((x) => ({ ...x, [l.key]: { ...ex, lot: !ex.lot } }))}
          >
            <Chip size="md" tone={ex.lot || l.tracksExpiry ? "info" : "neutro"}>
              Lote y vencimiento
            </Chip>
          </button>
        </div>
        {ex.damaged && (
          <TextField
            label="Dañados (no entran al stock)"
            inputMode="decimal"
            value={l.damaged}
            onChange={(e) => set(l.key, { damaged: e.target.value.replace(/[^\d,]/g, "") })}
          />
        )}
        {(ex.lot || l.tracksExpiry) && (
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Lote"
              value={l.lotCode}
              onChange={(e) => set(l.key, { lotCode: e.target.value })}
            />
            <TextField
              label="Vence"
              type="date"
              value={l.expiresOn}
              onChange={(e) => set(l.key, { expiresOn: e.target.value })}
            />
          </div>
        )}
        {costs && (
          <>
            <TextField
              label="Costo por unidad"
              inputMode="decimal"
              value={l.cost}
              onChange={(e) =>
                set(l.key, { cost: e.target.value, newPriceCents: null, later: false })
              }
            />
            <CostNotice
              line={l}
              rounding={settings.pricing.roundingCents}
              onUpdate={(p) => set(l.key, { newPriceCents: p })}
              onLater={() => set(l.key, { later: true })}
            />
          </>
        )}
        <Button variant="secondary" onClick={() => setActive(null)}>
          Listo
        </Button>
      </section>
    );
  };

  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="m-0 text-xl font-semibold">
            {order
              ? `Recibir pedido ${orderNumber(order.number)}`
              : kind === "wholesale"
                ? "Compra en mayorista"
                : "Recibir sin pedido"}
          </h2>
          <div className="text-[13px] text-texto-suave">
            {order
              ? `${order.supplier.name}${order.expectedOn ? ` · entrega ${formatDate(order.expectedOn).slice(0, 5)}` : ""}`
              : "Escaneá o buscá cada producto"}
          </div>
        </div>
        {order && (
          <output
            aria-label="Avance"
            className="rounded-full bg-neutro-suave px-3 py-1 text-sm font-semibold"
          >
            {touched.length} de {lines.length}
          </output>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-card border border-borde bg-superficie p-3">
        <ScanBarcode size={22} className="text-primario" aria-hidden />
        <span className="flex-1 text-sm">Escaneá lo que llega</span>
        <Button variant="secondary" onClick={() => scanRouter.openCamera()}>
          Cámara
        </Button>
      </div>
      {act && lineCard(act)}
      {!order && (
        <div className="flex flex-col gap-1">
          <TextField
            label="Buscar producto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nombre"
          />
          {found.map((p) => (
            <button
              key={p.id}
              type="button"
              className="rounded-md px-3 py-2 text-left hover:bg-neutro-suave"
              onClick={() => {
                setSearch("");
                void addProduct(p.id);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {order && lines.some((l) => l.received === "") && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            setLines((ls) =>
              ls.map((l) =>
                l.received === "" && l.ordered != null
                  ? { ...l, received: String(l.ordered).replace(".", ",") }
                  : l,
              ),
            )
          }
        >
          Todo lo demás como pedido
        </Button>
      )}
      {lines.length > 0 && (
        <ul
          className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
          aria-label="Productos de la recepción"
        >
          {lines.map((l) => (
            <li key={l.key}>
              <button
                type="button"
                onClick={() => activate(l.key)}
                className={cx(
                  "flex min-h-12 w-full items-center gap-3 border-b border-borde px-4 py-2 text-left",
                  active === l.key && "bg-primario-suave/60",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="tnum text-sm text-texto-suave">
                  {l.ordered != null ? qtyText(l.ordered, l.unit) : "—"} →{" "}
                  <strong className="text-texto">
                    {l.received === "" ? "…" : qtyText(num(l.received), l.unit)}
                  </strong>
                </span>
                {l.received !== "" && (
                  <CircleCheck
                    size={18}
                    className={
                      l.ordered != null && num(l.received) < l.ordered
                        ? "text-alerta"
                        : "text-exito"
                    }
                    aria-hidden
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          aria-label="Foto del remito"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setPhotoId(await queuePhoto(f));
          }}
        />
        <Button
          variant="secondary"
          icon={<Camera size={18} />}
          onClick={() => fileRef.current?.click()}
        >
          {photoId ? "Foto del remito ✓" : "Foto del remito"}
        </Button>
        <span className="flex-1" />
        <Button
          size="lg"
          disabled={!touched.some((l) => num(l.received) > 0) || confirm.isPending}
          onClick={tryConfirm}
        >
          Confirmar recepción
        </Button>
      </div>
      {summary && (
        <Sheet
          open
          onClose={() => setSummary(false)}
          title="Recepción con diferencias"
          footer={
            <Button
              className="flex-1"
              onClick={() => confirm.mutate()}
              disabled={confirm.isPending}
            >
              Confirmar igual
            </Button>
          }
        >
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm" aria-label="Diferencias">
            {sum.lines.map((t) => (
              <li key={t} className="rounded-lg bg-neutro-suave px-3 py-2">
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-3 mb-0 text-xs text-texto-suave">
            Lo que falta queda pendiente en el pedido. Los dañados no entran al stock.
          </p>
        </Sheet>
      )}
    </div>
  );
}

/** Recepción de mercadería (pensada para el celular). Funciona sin conexión: queda en cola. */
export function ReceivePage() {
  const can = useCan("count_receive");
  const [params] = useSearchParams();
  const orderId = params.get("pedido");
  const kind =
    (params.get("tipo") as "no_order" | "wholesale" | null) ?? (orderId ? "order" : null);
  const order = useQuery({
    queryKey: ["receive-order", orderId],
    queryFn: () => api<OrderData>(`/api/receipts/order/${orderId}`),
    enabled: can && !!orderId,
  });
  if (!can) return <NoPermissionFor perm="count_receive" />;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 lg:max-w-3xl lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold">Compras</h1>
        <PurchasesTabs />
      </div>
      {!kind ? (
        <Start />
      ) : orderId ? (
        order.isPending ? (
          <SkeletonList />
        ) : order.isError ? (
          <ErrorState
            message="El pedido se ve con conexión. Podés recibir sin pedido y queda en cola."
            onRetry={() => order.refetch()}
          />
        ) : (
          <Receiving
            key={orderId}
            order={order.data}
            supplierId={order.data.supplier.id}
            kind="order"
          />
        )
      ) : (
        <Receiving key={kind} order={null} supplierId={params.get("proveedor")} kind={kind} />
      )}
    </div>
  );
}
