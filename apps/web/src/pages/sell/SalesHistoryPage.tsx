import {
  formatDate,
  formatMoney,
  formatQty,
  formatTime,
  METHOD_LABEL,
  type PaymentMethodCode,
  saleNumberLabel,
  todayAR,
} from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Search } from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan, useGrant, useMe } from "../../app/session";
import { useViewport } from "../../app/useViewport";
import { requestPin } from "../../auth/pinAuth";
import { useRegister } from "../../cash/useRegister";
import { api, OfflineError } from "../../data/api";
import { localDb } from "../../data/db";
import { useSettings } from "../../data/settings";
import { returnSaleLocal, voidSaleLocal } from "../../sell/afterSale";
import { printTicket, shareTicket, ticketFromSale } from "../../sell/ticket";
import { useSyncStatus } from "../../sync/status";
import { Button } from "../../ui/Button";
import { Chip, FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { SelectField, TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { EmptyState, ErrorState, OfflineBanner, SkeletonList } from "../../ui/States";
import { Stepper } from "../../ui/Stepper";
import { toast } from "../../ui/toast";

type Line = {
  id: string;
  productId: string | null;
  kind: string;
  description: string;
  qty: number;
  unit: "unit" | "kg";
  unitPriceCents: number;
  totalCents: number;
  discountCents: number;
  returnedQty?: number;
};
type Pay = { method: PaymentMethodCode; amountCents: number };
type SaleDetail = {
  id: string;
  number: number;
  deviceAt: string;
  memberName: string | null;
  customerId: string | null;
  customerName?: string | null;
  registerName?: string | null;
  status: "completed" | "voided";
  totalCents: number;
  subtotalCents: number;
  discountCents: number;
  surchargeCents: number;
  changeCents: number;
  lines: Line[];
  payments: Pay[];
  timeline?: { at: string; text: string }[];
  returns?: { totalCents: number }[];
  local?: boolean;
};
type SaleRow = {
  id: string;
  number: number;
  deviceAt: string;
  memberName: string | null;
  customerName?: string | null;
  totalCents: number;
  status: string;
  methods: PaymentMethodCode[];
  returnedCents: number;
  local?: boolean;
};

const FILTERS = [
  { id: "today", label: "Hoy" },
  { id: "cash", label: "Efectivo" },
  { id: "card", label: "Tarjeta" },
  { id: "account", label: "Fiado" },
  { id: "voided", label: "Anuladas" },
  { id: "returned", label: "Con devolución" },
] as const;

/** Ventas guardadas en este dispositivo (sin conexión, es lo que hay). */
async function localSales(): Promise<SaleDetail[]> {
  const rows = (await localDb().sales.toArray()) as unknown as SaleDetail[];
  return rows
    .map((r) => ({ ...r, local: true }))
    .sort((a, b) => (a.deviceAt < b.deviceAt ? 1 : -1));
}

function statusChip(s: { status: string; returnedCents?: number }) {
  if (s.status === "voided") return <Chip tone="peligro">Anulada</Chip>;
  if (s.returnedCents) return <Chip tone="alerta">Con devolución</Chip>;
  return <Chip tone="ok">Cobrada</Chip>;
}

const REASONS = {
  expired: "Vencido",
  faulty: "Fallado",
  exchange: "Cambio",
  billing_error: "Error de cobro",
  other: "Otro",
} as const;

function ReturnDialog({ sale, onClose }: { sale: SaleDetail; onClose: () => void }) {
  const me = useMe();
  const grant = useGrant("void_sale");
  const reg = useRegister();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [dest, setDest] = useState<Record<string, "shelf" | "waste">>({});
  const [reason, setReason] = useState<keyof typeof REASONS>("expired");
  const [method, setMethod] = useState<"cash" | "same" | "credit">("cash");
  const lines = sale.lines.filter((l) => l.kind === "product" || l.kind === "misc");
  const items = lines
    .filter((l) => (qty[l.id] ?? 0) > 0)
    .map((l) => ({
      saleLineId: l.id,
      qty: qty[l.id] ?? 0,
      totalCents: Math.round((l.totalCents / l.qty) * (qty[l.id] ?? 0)),
      destination: dest[l.id] ?? (reason === "expired" || reason === "faulty" ? "waste" : "shelf"),
    }));
  const total = items.reduce((s, i) => s + i.totalCents, 0);
  const submit = async () => {
    if (!me || !items.length) return;
    let auth: string | null = null;
    if (grant === "pin") {
      const a = await requestPin(
        "void_sale",
        `Devolución de ${formatMoney(total)} de la ${saleNumberLabel(sale.number).toLowerCase()} · pedido por ${me.member.name}.`,
      );
      if (!a) return;
      auth = a.memberId;
    }
    await returnSaleLocal({
      memberId: me.member.id,
      authorizedBy: auth,
      sale: { ...sale, customerId: sale.customerId },
      shiftId: reg.shift?.id ?? null,
      reason,
      refundMethod: method,
      lines: items,
    });
    toast({ text: `Devolución registrada: ${formatMoney(total)}` });
    onClose();
  };
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={`Devolver de la ${saleNumberLabel(sale.number).toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1 lg:flex-none">
            Cancelar
          </Button>
          <div className="hidden flex-1 lg:block" />
          <Button
            onClick={() => void submit()}
            disabled={!items.length}
            locked={grant === "pin"}
            className="flex-1 lg:flex-none"
          >
            Devolver {formatMoney(total)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-texto-suave">
          Elegí qué vuelve y cómo se devuelve la plata. Queda registrado quién lo hizo.
        </p>
        <ul className="m-0 list-none p-0">
          {lines.map((l) => {
            const max = l.qty - (l.returnedQty ?? 0);
            const d =
              dest[l.id] ?? (reason === "expired" || reason === "faulty" ? "waste" : "shelf");
            return (
              <li
                key={l.id}
                className="flex flex-wrap items-center gap-3 border-b border-borde py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{l.description}</span>
                  <span className="block text-xs text-texto-suave">
                    Vendido {formatQty(l.qty, l.unit)}
                    {l.returnedQty ? ` · ya devuelto ${formatQty(l.returnedQty, l.unit)}` : ""}
                  </span>
                </span>
                {l.unit === "unit" ? (
                  <Stepper
                    label={l.description}
                    value={qty[l.id] ?? 0}
                    onChange={(v) => setQty((q) => ({ ...q, [l.id]: Math.min(max, v) }))}
                  />
                ) : (
                  <FilterChip
                    active={(qty[l.id] ?? 0) > 0}
                    onClick={() => setQty((q) => ({ ...q, [l.id]: q[l.id] ? 0 : max }))}
                  >
                    {formatQty(max, "kg")}
                  </FilterChip>
                )}
                <span className="inline-flex overflow-hidden rounded-lg border border-borde text-xs font-semibold">
                  {(
                    [
                      ["shelf", "Góndola"],
                      ["waste", "Merma"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={d === id}
                      onClick={() => setDest((x) => ({ ...x, [l.id]: id }))}
                      className={cx(
                        "h-8 px-2.5",
                        d === id ? "bg-texto text-fondo" : "bg-superficie",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <SelectField
            label="Motivo"
            value={reason}
            onChange={(e) => setReason(e.target.value as keyof typeof REASONS)}
          >
            {Object.entries(REASONS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Devolver con"
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
          >
            <option value="cash">Efectivo</option>
            <option value="same">El mismo medio de pago</option>
            <option value="credit" disabled={!sale.customerId}>
              Saldo a favor del cliente
            </option>
          </SelectField>
        </div>
      </div>
    </Sheet>
  );
}

function VoidDialog({ sale, onClose }: { sale: SaleDetail; onClose: () => void }) {
  const me = useMe();
  const grant = useGrant("void_sale");
  const reg = useRegister();
  const [reason, setReason] = useState("");
  const submit = async () => {
    if (!me || !reason.trim()) return;
    let auth: string | null = null;
    if (grant === "pin") {
      const a = await requestPin(
        "void_sale",
        `Anular la ${saleNumberLabel(sale.number).toLowerCase()} de ${formatMoney(sale.totalCents)} · pedido por ${me.member.name}.`,
      );
      if (!a) return;
      auth = a.memberId;
    }
    await voidSaleLocal({
      memberId: me.member.id,
      authorizedBy: auth,
      sale,
      shiftId: reg.shift?.id ?? null,
      reason: reason.trim(),
    });
    toast({ text: `${saleNumberLabel(sale.number)} anulada` });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Anular la ${saleNumberLabel(sale.number).toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            Cancelar · Esc
          </Button>
          <Button
            variant="danger"
            onClick={() => void submit()}
            disabled={!reason.trim()}
            locked={grant === "pin"}
            className="flex-1"
          >
            {grant === "pin" ? "Anular con PIN" : "Anular"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-sm text-texto-suave">
          La venta queda visible como Anulada; nunca se borra. Vuelve el stock y sale la plata de la
          caja.
        </p>
        <TextField
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Error de cobro"
        />
      </div>
    </Sheet>
  );
}

function SaleDetailView({ id, onBack }: { id: string; onBack?: () => void }) {
  const me = useMe();
  const settings = useSettings();
  const voidGrant = useGrant("void_sale");
  const canVoid = voidGrant !== "deny";
  const pinToVoid = voidGrant === "pin";
  const { version } = useSyncStatus();
  const [dialog, setDialog] = useState<null | "return" | "void">(null);
  const q = useQuery({
    queryKey: ["sale", id, version],
    queryFn: async (): Promise<SaleDetail | null> => {
      try {
        return await api<SaleDetail>(`/api/sales/${id}`);
      } catch (err) {
        const local = (await localDb().sales.get(id)) as unknown as SaleDetail | undefined;
        if (local) return { ...local, local: true };
        if (err instanceof OfflineError) return null;
        throw err;
      }
    },
    placeholderData: (p) => p,
  });
  if (q.isPending) return <SkeletonList rows={4} className="p-4" />;
  if (q.isError || !q.data)
    return <ErrorState message="No pudimos abrir la venta." onRetry={() => q.refetch()} />;
  const s = q.data;
  const ticket = () =>
    ticketFromSale(
      { ...s, memberName: s.memberName ?? "" },
      me?.business ?? { name: "Mostrador" },
      settings.tickets.footer,
      s.customerName,
    );
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-borde px-5 py-4">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              aria-label="Volver"
              onClick={onBack}
              className="-ml-2 inline-flex size-10 items-center justify-center"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <h2 className="m-0 flex-1 text-lg font-semibold">{saleNumberLabel(s.number)}</h2>
          {statusChip({
            status: s.status,
            returnedCents: s.returns?.reduce((a, r) => a + r.totalCents, 0),
          })}
        </div>
        <div className="text-[13px] text-texto-suave">
          {formatDate(new Date(s.deviceAt))} {formatTime(new Date(s.deviceAt))} ·{" "}
          {s.memberName ?? ""} · {s.registerName ?? "Caja 1"} · {s.customerName ?? "sin cliente"}
          {s.local ? " · sin sincronizar" : ""}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 text-sm">
        {s.lines.map((l) => (
          <div key={l.id} className="flex justify-between gap-3">
            <span>
              {l.description}{" "}
              <span className="text-texto-suave">
                · {formatQty(l.qty, l.unit)} × {formatMoney(l.unitPriceCents)}
              </span>
            </span>
            <span className="tnum font-semibold">{formatMoney(l.totalCents)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-borde pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="tnum">{formatMoney(s.totalCents)}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-texto-suave">
          <span>
            {s.payments
              .map((p) => `${METHOD_LABEL[p.method]} ${formatMoney(p.amountCents)}`)
              .join(" + ")}
          </span>
          {s.changeCents > 0 && <span>Vuelto {formatMoney(s.changeCents)}</span>}
        </div>
        {s.timeline && (
          <div className="mt-2 flex flex-col gap-1 text-[13px]">
            <div className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Historial
            </div>
            {s.timeline.map((t) => (
              <div key={`${t.at}-${t.text}`}>
                {formatTime(new Date(t.at))} · {t.text}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 border-t border-borde p-4 lg:grid-cols-4">
        <Button
          variant="secondary"
          onClick={() => void printTicket(ticket(), settings.tickets.width)}
        >
          Reimprimir
        </Button>
        <Button
          variant="secondary"
          onClick={() => void shareTicket(ticket(), settings.tickets.width)}
        >
          Compartir
        </Button>
        {canVoid && s.status === "completed" && (
          <>
            <Button variant="secondary" onClick={() => setDialog("return")}>
              Devolver
            </Button>
            <Button variant="danger" locked={pinToVoid} onClick={() => setDialog("void")}>
              Anular
            </Button>
          </>
        )}
      </div>
      {dialog === "return" && <ReturnDialog sale={s} onClose={() => setDialog(null)} />}
      {dialog === "void" && <VoidDialog sale={s} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Historial de ventas: lista con filtros y búsqueda por número; el detalle a la derecha. */
export function SalesHistoryPage() {
  const can = useCan("sell");
  const { layout } = useViewport();
  const desktop = layout === "desktop" || layout === "wide";
  const navigate = useNavigate();
  const params = useParams();
  const { version } = useSyncStatus();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("today");
  const [number, setNumber] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["sales", filter, number, version],
    placeholderData: (p) => p,
    queryFn: async (): Promise<{ rows: SaleRow[]; offline: boolean }> => {
      const p = new URLSearchParams();
      if (number) p.set("number", number);
      else if (filter === "today") p.set("from", todayAR());
      if (filter === "cash") p.set("method", "cash");
      if (filter === "account") p.set("method", "account");
      if (filter === "voided") p.set("status", "voided");
      if (filter === "returned") p.set("status", "returned");
      const local = await localSales();
      try {
        const server = await api<SaleRow[]>(`/api/sales?${p}`);
        // Las de este dispositivo que todavía no llegaron al servidor, arriba.
        const ids = new Set(server.map((s) => s.id));
        const queued = new Set(
          (await localDb().queue.toArray())
            .filter((x) => x.type === "sale.create")
            .map((x) => (x.op.payload as { id: string }).id),
        );
        const pending = local
          .filter((l) => queued.has(l.id) && !ids.has(l.id))
          .map((l) => ({ ...l, methods: l.payments.map((x) => x.method), returnedCents: 0 }));
        return { rows: [...pending, ...server], offline: false };
      } catch (err) {
        if (!(err instanceof OfflineError)) throw err;
        return {
          rows: local.map((l) => ({
            ...l,
            methods: l.payments.map((x) => x.method),
            returnedCents: 0,
          })),
          offline: true,
        };
      }
    },
  });
  if (!can) return <NoPermissionFor perm="sell" />;
  const selected = desktop ? open : (params.id ?? null);
  if (!desktop && params.id) {
    return (
      <div className="min-h-full bg-superficie">
        <SaleDetailView id={params.id} onBack={() => navigate("/vender/historial")} />
      </div>
    );
  }
  const rows = (q.data?.rows ?? []).filter((r) =>
    filter === "card" ? r.methods.some((m) => m === "debit" || m === "credit") : true,
  );
  return (
    <div className={cx("flex flex-col gap-3 p-4 lg:p-6", desktop && "h-full")}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold">Ventas</h1>
        <nav className="flex gap-1 rounded-lg bg-neutro-suave p-1 text-[13px] font-semibold">
          <NavLink to="/vender" end className="rounded-md px-3 py-1.5 text-texto-suave">
            Venta
          </NavLink>
          <span className="rounded-md bg-superficie px-3 py-1.5">Historial</span>
        </nav>
        <span className="flex-1" />
        <label className="flex h-9 w-48 items-center gap-2 rounded-lg border border-borde bg-superficie px-2.5 text-[13px] text-texto-suave">
          <Search size={16} aria-hidden />
          <input
            aria-label="Número de venta"
            inputMode="numeric"
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))}
            placeholder="N° de venta"
            className="min-w-0 flex-1 bg-transparent text-texto outline-none"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <FilterChip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
          </FilterChip>
        ))}
      </div>
      {q.data?.offline && (
        <OfflineBanner>Sin conexión: se ven las ventas de este dispositivo.</OfflineBanner>
      )}
      <div
        className={cx(
          "grid min-h-0 flex-1 gap-4",
          desktop && selected ? "grid-cols-[minmax(0,1fr)_400px]" : "grid-cols-1",
        )}
      >
        <div className="min-h-0 overflow-y-auto">
          {q.isPending ? (
            <SkeletonList />
          ) : q.isError ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : !rows.length ? (
            <EmptyState
              title="No hay ventas con ese filtro"
              body={filter === "today" ? "Todavía no hay ventas hoy." : undefined}
            />
          ) : (
            <table
              className="block w-full overflow-hidden rounded-card border border-borde bg-superficie"
              aria-label="Ventas"
            >
              <thead className="block">
                <tr className="grid grid-cols-[80px_56px_minmax(0,1fr)_110px_100px] gap-2 border-b border-borde bg-fondo px-4 py-2 text-left text-xs font-semibold text-texto-suave lg:grid-cols-[80px_56px_minmax(0,1fr)_130px_100px_120px]">
                  <th className="font-semibold">N°</th>
                  <th className="font-semibold">Hora</th>
                  <th className="font-semibold">Cajero · cliente</th>
                  <th className="font-semibold">Medio</th>
                  <th className="text-right font-semibold">Total</th>
                  <th className="hidden font-semibold lg:block">Estado</th>
                </tr>
              </thead>
              <tbody className="block">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onClick={() =>
                      desktop ? setOpen(r.id) : navigate(`/vender/historial/${r.id}`)
                    }
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      (desktop ? setOpen(r.id) : navigate(`/vender/historial/${r.id}`))
                    }
                    className={cx(
                      "grid min-h-11 cursor-pointer grid-cols-[80px_56px_minmax(0,1fr)_110px_100px] items-center gap-2 border-b border-borde px-4 text-sm last:border-b-0 hover:bg-fondo lg:grid-cols-[80px_56px_minmax(0,1fr)_130px_100px_120px]",
                      selected === r.id && "bg-primario-suave/60",
                    )}
                  >
                    <td className="tnum font-semibold">{String(r.number).padStart(6, "0")}</td>
                    <td className="tnum text-texto-suave">{formatTime(new Date(r.deviceAt))}</td>
                    <td className="truncate">
                      {r.memberName}
                      {r.customerName ? ` · ${r.customerName}` : ""}
                      {r.local ? " · sin sincronizar" : ""}
                    </td>
                    <td className="truncate text-texto-suave">
                      {r.methods.map((m) => METHOD_LABEL[m]).join(" + ")}
                    </td>
                    <td
                      className={cx(
                        "tnum text-right font-semibold",
                        r.status === "voided" && "text-texto-apagado line-through",
                      )}
                    >
                      {formatMoney(r.totalCents)}
                    </td>
                    <td className="hidden lg:block">{statusChip(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {desktop && selected && (
          <aside
            aria-label="Detalle de la venta"
            className="min-h-0 overflow-hidden rounded-card border border-borde bg-superficie"
          >
            <SaleDetailView key={selected} id={selected} />
          </aside>
        )}
      </div>
    </div>
  );
}
