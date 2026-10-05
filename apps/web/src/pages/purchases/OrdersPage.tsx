import {
  formatDate,
  formatMoney,
  formatQty,
  formatTime,
  ORDER_STATUS,
  type OrderStatus,
  orderNumber,
} from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, MessageCircle, Repeat } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan } from "../../app/session";
import { ApiError, api, downloadFile } from "../../data/api";
import { Button } from "../../ui/Button";
import { Chip, FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Sheet } from "../../ui/Sheet";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";
import { useWide } from "../../ui/useMedia";
import { PurchasesTabs } from "./PurchasesTabs";

type OrderRow = {
  id: string;
  number: number;
  status: OrderStatus;
  supplierName: string;
  expectedOn: string | null;
  sentAt: string | null;
  createdAt: string;
  totalCents?: number;
  lineCount: number;
};
type OrderLine = {
  id: string;
  description: string;
  qtyOrdered: number;
  qtyConfirmed: number | null;
  qtyReceived: number | null;
  unit: "unit" | "kg";
  packQty: number | null;
  unitCostCents?: number | null;
};
export type OrderDetail = {
  id: string;
  number: number;
  status: OrderStatus;
  expectedOn: string | null;
  notes: string | null;
  totalCents?: number;
  supplier: {
    id: string;
    name: string;
    contactName: string | null;
    whatsapp: string | null;
    channel: string;
  };
  lines: OrderLine[];
  nextSteps: OrderStatus[];
  timeline: { at: string; status: OrderStatus; note?: string; by: string | null }[];
  message: { text: string; url: string; phone: string | null };
};
type Standing = {
  id: string;
  name: string;
  supplierName: string;
  weekdays: number[];
  lines: { productId: string; name: string; qty: number; unit: "unit" | "kg" }[];
};

const FILTERS: [string, OrderStatus[] | null][] = [
  ["Todos", null],
  ["Borrador", ["draft"]],
  ["Enviado", ["sent"]],
  ["Confirmado", ["confirmed", "changed"]],
  ["Recibido", ["partial", "received"]],
  ["Cerrado", ["closed"]],
  ["Cancelado", ["cancelled"]],
];

const STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  sent: "Marcar enviado",
  confirmed: "Marcar confirmado",
  changed: "Confirmado con cambios",
  closed: "Cerrar",
  cancelled: "Cancelar pedido",
};

const shortDate = (d: string | null) => (d ? formatDate(d).slice(0, 5) : "—");
const q = (n: number | null, unit: "unit" | "kg") => (n == null ? "—" : formatQty(n, unit));

/** Vista previa del mensaje y del PDF antes de abrir el chat (wa.me). */
export function SendSheet({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const mark = useMutation({
    mutationFn: (via: "whatsapp" | "pdf") =>
      api(`/api/orders/${order.id}/status`, { body: { status: "sent", via } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["order", order.id] });
      toast({ text: `Pedido ${orderNumber(order.number)} marcado como enviado` });
      onClose();
    },
  });
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={`Enviar pedido ${orderNumber(order.number)}`}
      footer={
        <div className="flex w-full flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={<Download size={18} />}
            onClick={() =>
              void downloadFile(
                `/api/orders/${order.id}/pdf`,
                `pedido-${orderNumber(order.number)}.pdf`,
              )
            }
          >
            PDF para adjuntar
          </Button>
          <a
            href={order.message.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => mark.mutate("whatsapp")}
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primario px-4 font-semibold text-white no-underline"
          >
            <MessageCircle size={18} aria-hidden /> Abrir WhatsApp
          </a>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <div className="text-texto-suave">
          Para {order.supplier.name}
          {order.message.phone
            ? ` · +${order.message.phone}`
            : " · sin WhatsApp cargado: elegís el contacto en el chat"}
        </div>
        <section aria-label="Mensaje">
          <pre className="m-0 max-h-[50vh] overflow-auto rounded-xl bg-[#E7F6E7] p-4 font-sans text-[14px] leading-snug whitespace-pre-wrap text-texto">
            {order.message.text}
          </pre>
        </section>
        <p className="m-0 text-xs text-texto-suave">
          Al abrir WhatsApp el pedido queda como enviado. El PDF lo adjuntás en el chat si el
          proveedor lo pide.
        </p>
      </div>
    </Sheet>
  );
}

function ConfirmSheet({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const [got, setGot] = useState<Record<string, string>>(
    Object.fromEntries(
      order.lines.map((l) => [l.id, String(l.qtyConfirmed ?? l.qtyOrdered).replace(".", ",")]),
    ),
  );
  const save = useMutation({
    mutationFn: () =>
      api(`/api/orders/${order.id}/status`, {
        body: {
          status: "confirmed",
          confirmed: order.lines.map((l) => ({
            lineId: l.id,
            qty: Number((got[l.id] ?? "0").replace(",", ".")) || 0,
          })),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["order", order.id] });
      onClose();
    },
  });
  return (
    <Sheet
      open
      onClose={onClose}
      title="Lo que confirmó el proveedor"
      footer={
        <Button className="flex-1" onClick={() => save.mutate()}>
          Guardar
        </Button>
      }
    >
      <ul className="m-0 flex list-none flex-col p-0 text-sm">
        {order.lines.map((l) => (
          <li key={l.id} className="flex items-center gap-3 border-b border-borde py-2">
            <span className="flex-1">
              {l.description}
              <span className="block text-xs text-texto-suave">
                pedido {q(l.qtyOrdered, l.unit)}
              </span>
            </span>
            <input
              aria-label={`Confirmado ${l.description}`}
              inputMode="decimal"
              value={got[l.id] ?? ""}
              onChange={(e) =>
                setGot((g) => ({ ...g, [l.id]: e.target.value.replace(/[^\d,]/g, "") }))
              }
              className="tnum h-10 w-20 rounded-md border border-borde-fuerte px-2 text-right font-semibold"
            />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function OrderView({ id }: { id: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [confirming, setConfirming] = useState(false);
  const d = useQuery({
    queryKey: ["order", id],
    queryFn: () => api<OrderDetail>(`/api/orders/${id}`),
  });
  const step = useMutation({
    mutationFn: (status: OrderStatus) => api(`/api/orders/${id}/status`, { body: { status } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["order", id] });
    },
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo cambiar.", tone: "error" }),
  });
  if (d.isPending) return <SkeletonList rows={5} className="p-4" />;
  if (d.isError) return <ErrorState onRetry={() => d.refetch()} />;
  const o = d.data;
  const sending = params.get("enviar") === "1";
  const st = ORDER_STATUS[o.status];
  return (
    <div className="flex flex-col gap-3 p-5 text-sm">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1">
          <h2 className="m-0 text-lg font-semibold">
            Pedido {orderNumber(o.number)} · {o.supplier.name}
          </h2>
          <div className="text-texto-suave">
            {o.expectedOn ? `Entrega ${shortDate(o.expectedOn)}` : "Sin fecha de entrega"}
            {o.supplier.contactName ? ` · ${o.supplier.contactName}` : ""} · {o.lines.length}{" "}
            productos
            {o.totalCents !== undefined ? ` · ${formatMoney(o.totalCents)}` : ""}
          </div>
        </div>
        <Chip tone={st.tone} size="md">
          {st.label}
        </Chip>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-texto-suave">
              <th className="py-1.5 font-semibold">Producto</th>
              <th className="py-1.5 text-right font-semibold">Pedido</th>
              <th className="py-1.5 text-right font-semibold">Confirm.</th>
              <th className="py-1.5 text-right font-semibold">Recibido</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id} className="border-t border-borde">
                <td className="py-1.5 pr-2">{l.description}</td>
                <td className="tnum py-1.5 text-right">{q(l.qtyOrdered, l.unit)}</td>
                <td
                  className={cx(
                    "tnum py-1.5 text-right",
                    l.qtyConfirmed != null &&
                      l.qtyConfirmed !== l.qtyOrdered &&
                      "font-semibold text-alerta",
                  )}
                >
                  {q(l.qtyConfirmed, l.unit)}
                </td>
                <td className="tnum py-1.5 text-right">{q(l.qtyReceived, l.unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {o.notes && <div className="rounded-lg bg-neutro-suave px-3 py-2">{o.notes}</div>}
      <div className="mt-1 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
        Línea de tiempo
      </div>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Línea de tiempo">
        {o.timeline.map((t) => (
          <li key={`${t.at}${t.status}`} className="flex gap-2">
            <span className="tnum w-24 shrink-0 text-texto-suave">
              {formatDate(new Date(t.at)).slice(0, 5)} {formatTime(new Date(t.at))}
            </span>
            <span>
              {ORDER_STATUS[t.status].label}
              {t.note ? ` · ${t.note}` : ""}
              {t.by ? ` · ${t.by}` : ""}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap gap-2">
        {o.status === "draft" && (
          <Button
            icon={<MessageCircle size={18} />}
            onClick={() => setParams((p) => ({ ...Object.fromEntries(p), enviar: "1" }))}
          >
            Enviar por WhatsApp
          </Button>
        )}
        {o.nextSteps.includes("confirmed") && (
          <Button onClick={() => step.mutate("confirmed")}>Marcar confirmado</Button>
        )}
        {o.nextSteps.includes("changed") && (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Confirmado con cambios
          </Button>
        )}
        {["sent", "confirmed", "changed", "partial"].includes(o.status) && (
          <Button variant="secondary" onClick={() => navigate(`/compras/recepcion?pedido=${o.id}`)}>
            Recibir mercadería
          </Button>
        )}
        {o.nextSteps
          .filter((s) => s === "sent" || s === "closed")
          .map((s) => (
            <Button key={s} variant="secondary" onClick={() => step.mutate(s)}>
              {STEP_LABEL[s]}
            </Button>
          ))}
        <Button
          variant="ghost"
          icon={<Download size={18} />}
          onClick={() =>
            void downloadFile(`/api/orders/${o.id}/pdf`, `pedido-${orderNumber(o.number)}.pdf`)
          }
        >
          PDF
        </Button>
        {o.nextSteps.includes("cancelled") && (
          <Button variant="ghost" className="text-peligro" onClick={() => step.mutate("cancelled")}>
            Cancelar pedido
          </Button>
        )}
      </div>
      {sending && (
        <SendSheet
          order={o}
          onClose={() =>
            setParams((p) => {
              const n = new URLSearchParams(p);
              n.delete("enviar");
              return n;
            })
          }
        />
      )}
      {confirming && <ConfirmSheet order={o} onClose={() => setConfirming(false)} />}
    </div>
  );
}

function StandingOrders() {
  const navigate = useNavigate();
  const s = useQuery({
    queryKey: ["standing-orders"],
    queryFn: () => api<Standing[]>("/api/standing-orders"),
  });
  const draft = useMutation({
    mutationFn: (id: string) =>
      api<{ id: string }>(`/api/standing-orders/${id}/draft`, { body: {} }),
    onSuccess: (o) => navigate(`/compras/pedidos/${o.id}`),
  });
  if (!s.data?.length) return null;
  return (
    <section aria-label="Pedidos fijos" className="rounded-card border border-borde bg-superficie">
      <div className="border-b border-borde px-4 py-2.5 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
        Pedido fijo
      </div>
      {s.data.map((x) => (
        <div
          key={x.id}
          className="flex items-center gap-3 border-b border-borde px-4 py-3 last:border-b-0"
        >
          <Repeat size={18} className="text-texto-suave" aria-hidden />
          <span className="flex-1 text-sm">
            <span className="font-semibold">{x.supplierName}</span> · {x.name}
            <span className="block text-xs text-texto-suave">
              {x.lines.map((l) => `${l.name} ${formatQty(l.qty, l.unit)}`).join(" · ")}
            </span>
          </span>
          <Button variant="secondary" onClick={() => draft.mutate(x.id)}>
            Armar el de hoy
          </Button>
        </div>
      ))}
    </section>
  );
}

/** Pedidos por estado con el detalle al lado (en iPhone, el detalle va en su propia pantalla). */
export function OrdersPage() {
  const can = useCan("build_orders");
  const wide = useWide();
  const navigate = useNavigate();
  const { id } = useParams();
  const [filter, setFilter] = useState(0);
  const statuses = FILTERS[filter]?.[1];
  const list = useQuery({
    queryKey: ["orders", statuses?.join(",") ?? "all"],
    queryFn: () =>
      api<{ items: OrderRow[]; counts: Record<string, number> }>(
        `/api/orders${statuses ? `?status=${statuses.join(",")}` : ""}`,
      ),
    enabled: can,
  });
  if (!can) return <NoPermissionFor perm="build_orders" />;
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const showList = wide || !id;
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold">Compras</h1>
        <PurchasesTabs />
      </div>
      {showList && (
        <nav className="flex gap-2 overflow-x-auto" aria-label="Estados">
          {FILTERS.map(([label, st], i) => (
            <FilterChip key={label} active={filter === i} onClick={() => setFilter(i)}>
              {label} · {st ? st.reduce((a, s) => a + (counts[s] ?? 0), 0) : total}
            </FilterChip>
          ))}
        </nav>
      )}
      <div
        className={cx("grid gap-4", wide && id ? "grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]" : "")}
      >
        {showList && (
          <div className="flex flex-col gap-4">
            {list.isPending ? (
              <SkeletonList />
            ) : list.isError ? (
              <ErrorState onRetry={() => list.refetch()} />
            ) : !list.data.items.length ? (
              <EmptyState title="No hay pedidos acá" body="Armalos desde el pedido sugerido." />
            ) : (
              <ul
                className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
                aria-label="Pedidos"
              >
                {list.data.items.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/compras/pedidos/${o.id}`)}
                      className={cx(
                        "flex w-full items-center gap-3 border-b border-borde px-4 py-3 text-left",
                        id === o.id && "bg-primario-suave/60",
                      )}
                    >
                      <span className="tnum font-semibold text-texto-suave">
                        {orderNumber(o.number)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{o.supplierName}</span>
                        <span className="block text-xs text-texto-suave">
                          {o.sentAt
                            ? `Enviado ${shortDate(o.sentAt.slice(0, 10))}`
                            : `Armado ${shortDate(o.createdAt.slice(0, 10))}`}
                          {o.expectedOn ? ` · entrega ${shortDate(o.expectedOn)}` : ""} ·{" "}
                          {o.lineCount} productos
                        </span>
                      </span>
                      <Chip tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Chip>
                      {o.totalCents !== undefined && (
                        <span className="tnum min-w-20 text-right font-semibold">
                          {formatMoney(o.totalCents)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <StandingOrders />
          </div>
        )}
        {id && (
          <aside
            aria-label="Detalle del pedido"
            className="rounded-card border border-borde bg-superficie"
          >
            {!wide && (
              <Button variant="ghost" className="m-2" onClick={() => navigate("/compras/pedidos")}>
                ← Pedidos
              </Button>
            )}
            <OrderView key={id} id={id} />
          </aside>
        )}
      </div>
    </div>
  );
}
