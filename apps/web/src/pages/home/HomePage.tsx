import {
  formatMoney,
  formatPercent,
  formatQty,
  METHOD_LABEL,
  type PaymentMethodCode,
} from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  ClipboardList,
  Info,
  PackageCheck,
  Receipt,
  ScanBarcode,
  ShoppingCart,
  Tag,
  TriangleAlert,
  Truck,
  Wallet,
} from "lucide-react";
import { Navigate, useNavigate } from "react-router";
import { useGrant, useMe } from "../../app/session";
import { useShell } from "../../app/shell";
import { api } from "../../data/api";
import { scanRouter } from "../../scan/GlobalScan";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";

type Attention = {
  key: string;
  severity: "danger" | "warning" | "info";
  text: string;
  action: string;
  path: string;
};
type Dashboard = {
  today: string;
  numbers: {
    salesCents: number;
    vsLastWeekBp: number | null;
    tickets: number;
    averageTicketCents: number;
    cashCents: number;
    marginCents?: number;
    marginBp?: number | null;
  };
  attention: Attention[];
  byHour: { hour: number; todayCents: number; avgCents: number }[];
  methods: Partial<Record<PaymentMethodCode, number>>;
  top: { name: string; qty: number; unit: "unit" | "kg"; cents: number }[];
  deliveries: { id: string; number: string; supplier: string; when: string; status: string }[];
};
type Tasks = { tasks: { key: string; text: string; detail: string; path: string }[] };

const METHOD_COLOR: Record<PaymentMethodCode, string> = {
  cash: "bg-primario",
  debit: "bg-info",
  qr: "bg-[#7a5af5]",
  transfer: "bg-alerta",
  credit: "bg-[#c2410c]",
  account: "bg-texto-suave",
};
const SEV = {
  danger: [CircleAlert, "text-peligro"],
  warning: [TriangleAlert, "text-alerta"],
  info: [Info, "text-info"],
} as const;

function longDate() {
  const s = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const time = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return `${s.charAt(0).toUpperCase()}${s.slice(1).replace(",", "")} · ${time}`;
}

function Header() {
  const me = useMe();
  const shell = useShell();
  const reg = shell.register;
  return (
    <div>
      <h1 className="m-0 text-[26px] font-semibold">Hola, {me?.member.name.split(" ")[0]}</h1>
      <div className="text-sm text-texto-suave">
        {longDate()} ·{" "}
        {reg?.open
          ? `Caja abierta por ${reg.cashier ?? "—"} desde ${reg.since ?? ""}`
          : "Caja cerrada"}
      </div>
    </div>
  );
}

function Numbers({ n }: { n: Dashboard["numbers"] }) {
  const cards: [string, string, React.ReactNode?][] = [
    [
      "Ventas",
      formatMoney(n.salesCents),
      n.vsLastWeekBp != null ? (
        <span
          key="delta"
          className={cx(
            "inline-flex items-center gap-0.5 text-xs font-semibold",
            n.vsLastWeekBp >= 0 ? "text-exito" : "text-peligro",
          )}
        >
          {n.vsLastWeekBp >= 0 ? (
            <ArrowUpRight size={14} aria-hidden />
          ) : (
            <ArrowDownRight size={14} aria-hidden />
          )}
          {n.vsLastWeekBp >= 0 ? "+" : "−"}
          {formatPercent(Math.abs(n.vsLastWeekBp))} vs. la semana pasada
        </span>
      ) : (
        <span key="delta" className="text-xs text-texto-suave">
          sin datos de la semana pasada
        </span>
      ),
    ],
    ["Tickets", String(n.tickets)],
    ["Ticket promedio", formatMoney(n.averageTicketCents)],
    ["Efectivo en caja", formatMoney(n.cashCents)],
  ];
  if (n.marginCents !== undefined)
    cards.push([
      "Margen estimado",
      formatMoney(n.marginCents),
      n.marginBp != null ? (
        <span key="m" className="text-xs text-texto-suave">
          {formatPercent(n.marginBp)} de lo vendido
        </span>
      ) : undefined,
    ]);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cards.map(([label, value, extra], i) => (
        <section
          key={label}
          aria-label={label}
          className={cx(
            "rounded-card border border-borde bg-superficie px-4 py-3",
            i === 0 && "col-span-2 lg:col-span-1",
          )}
        >
          <div className="text-xs text-texto-suave">{label}</div>
          <div className="tnum text-2xl font-semibold">{value}</div>
          {extra}
        </section>
      ))}
    </div>
  );
}

function AttentionList({ items }: { items: Attention[] }) {
  const navigate = useNavigate();
  return (
    <section
      aria-label="Requiere atención"
      className="overflow-hidden rounded-card border border-borde bg-superficie"
    >
      <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
        <h2 className="m-0 flex-1 text-base font-semibold">Requiere atención</h2>
        <span className="rounded-full bg-peligro-suave px-2 text-xs font-semibold text-peligro">
          {items.length}
        </span>
      </div>
      {!items.length ? (
        <div className="px-4 py-6 text-sm text-texto-suave">Todo en orden por ahora.</div>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((a) => {
            const [Icon, tone] = SEV[a.severity];
            return (
              <li
                key={a.key}
                className="flex items-center gap-3 border-b border-borde px-4 py-2.5 last:border-b-0"
              >
                <Icon size={20} className={cx("shrink-0", tone)} aria-hidden />
                <span className="min-w-0 flex-1 text-sm">{a.text}</span>
                <Button variant="secondary" onClick={() => navigate(a.path)}>
                  {a.action}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Shortcuts() {
  const navigate = useNavigate();
  const items: [string, typeof ShoppingCart, () => void][] = [
    ["Nueva venta", ShoppingCart, () => navigate("/vender")],
    ["Escanear", ScanBarcode, () => scanRouter.openCamera()],
    ["Recibir mercadería", PackageCheck, () => navigate("/compras/recepcion")],
    ["Nuevo pedido", Truck, () => navigate("/compras/sugerido")],
    ["Registrar gasto", Wallet, () => navigate("/caja")],
    ["Cambiar precios", Tag, () => navigate("/productos/precios")],
  ];
  return (
    <nav aria-label="Accesos rápidos" className="grid grid-cols-3 gap-2">
      {items.map(([label, Icon, go]) => (
        <button
          key={label}
          type="button"
          onClick={go}
          className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-card border border-borde bg-superficie px-2 text-center text-[13px] font-semibold"
        >
          <Icon size={22} className="text-primario" aria-hidden />
          {label}
        </button>
      ))}
    </nav>
  );
}

function HourChart({ data }: { data: Dashboard["byHour"] }) {
  const used = data.filter((h) => h.todayCents || h.avgCents);
  const from = Math.min(8, ...used.map((h) => h.hour));
  const to = Math.max(22, ...used.map((h) => h.hour));
  const hours = data.filter((h) => h.hour >= from && h.hour <= to);
  const max = Math.max(1, ...hours.map((h) => Math.max(h.todayCents, h.avgCents)));
  return (
    <section
      aria-label="Ventas por hora"
      className="rounded-card border border-borde bg-superficie p-4"
    >
      <h2 className="m-0 mb-3 text-base font-semibold">
        Ventas por hora{" "}
        <span className="text-sm font-normal text-texto-suave">
          hoy vs. el mismo día, 4 semanas
        </span>
      </h2>
      <div className="flex h-36 items-end gap-1" role="img" aria-label="Barras de ventas por hora">
        {hours.map((h) => (
          <div
            key={h.hour}
            className="relative flex h-full flex-1 items-end"
            title={`${h.hour} h: ${formatMoney(h.todayCents)} (promedio ${formatMoney(h.avgCents)})`}
          >
            <div
              className="w-full rounded-t bg-primario"
              style={{ height: `${(h.todayCents / max) * 100}%` }}
            />
            {h.avgCents > 0 && (
              <div
                className="absolute inset-x-0 border-t-2 border-dashed border-texto-suave"
                style={{ bottom: `${(h.avgCents / max) * 100}%` }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-texto-suave">
        <span>{from} h</span>
        <span>{Math.round((from + to) / 2)} h</span>
        <span>{to} h</span>
      </div>
    </section>
  );
}

function Methods({ methods }: { methods: Dashboard["methods"] }) {
  const entries = (Object.entries(methods) as [PaymentMethodCode, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <section
      aria-label="Medios de pago del día"
      className="rounded-card border border-borde bg-superficie p-4"
    >
      <h2 className="m-0 mb-3 text-base font-semibold">Medios de pago del día</h2>
      {!total ? (
        <div className="text-sm text-texto-suave">Todavía no hay ventas hoy.</div>
      ) : (
        <>
          <div className="flex h-4 overflow-hidden rounded-full">
            {entries.map(([m, v]) => (
              <div key={m} className={METHOD_COLOR[m]} style={{ width: `${(v / total) * 100}%` }} />
            ))}
          </div>
          <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-1.5 p-0 text-sm">
            {entries.map(([m, v]) => (
              <li key={m} className="flex items-center gap-2">
                <span className={cx("size-2.5 rounded-full", METHOD_COLOR[m])} />
                <span className="flex-1">{m === "account" ? "Fiado" : METHOD_LABEL[m]}</span>
                <span className="tnum text-texto-suave">{Math.round((v / total) * 100)} %</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function TopAndDeliveries({ d }: { d: Dashboard }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-label="Lo más vendido hoy"
        className="rounded-card border border-borde bg-superficie p-4"
      >
        <h2 className="m-0 mb-2 text-base font-semibold">Lo más vendido hoy</h2>
        {!d.top.length ? (
          <div className="text-sm text-texto-suave">Todavía no hay ventas hoy.</div>
        ) : (
          <ol className="m-0 list-none p-0 text-sm">
            {d.top.map((t, i) => (
              <li key={t.name} className="flex gap-2 border-t border-borde py-1.5 first:border-t-0">
                <span className="w-4 text-texto-suave">{i + 1}</span>
                <span className="flex-1">{t.name}</span>
                <span className="tnum text-texto-suave">{formatQty(t.qty, t.unit)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section
        aria-label="Entregas esperadas"
        className="rounded-card border border-borde bg-superficie p-4"
      >
        <h2 className="m-0 mb-2 text-base font-semibold">Entregas esperadas</h2>
        {!d.deliveries.length ? (
          <div className="text-sm text-texto-suave">Nada para hoy ni mañana.</div>
        ) : (
          <ul className="m-0 list-none p-0 text-sm">
            {d.deliveries.map((x) => (
              <li key={x.id} className="flex gap-2 border-t border-borde py-1.5 first:border-t-0">
                <span className="flex-1">
                  {x.supplier} · {x.number}
                </span>
                <span className="text-texto-suave">
                  {x.when}
                  {x.status === "sent" ? " · sin confirmar" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StockerHome() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["tasks"], queryFn: () => api<Tasks>("/api/dashboard/tasks") });
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 lg:p-6">
      <Header />
      <section
        aria-label="Tus tareas"
        className="overflow-hidden rounded-card border border-borde bg-superficie"
      >
        <h2 className="m-0 border-b border-borde px-4 py-3 text-base font-semibold">Tus tareas</h2>
        {q.isPending ? (
          <SkeletonList rows={3} className="p-3" />
        ) : q.isError ? (
          <ErrorState message="Las tareas se ven con conexión." onRetry={() => q.refetch()} />
        ) : !q.data.tasks.length ? (
          <div className="px-4 py-6 text-sm text-texto-suave">No tenés tareas pendientes.</div>
        ) : (
          q.data.tasks.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => navigate(t.path)}
              className="flex min-h-16 w-full items-center gap-3 border-b border-borde px-4 py-3 text-left last:border-b-0"
            >
              <ClipboardList size={22} className="text-primario" aria-hidden />
              <span className="flex-1">
                <span className="block font-semibold">{t.text}</span>
                <span className="block text-[13px] text-texto-suave">{t.detail}</span>
              </span>
            </button>
          ))
        )}
      </section>
      <p className="m-0 text-xs text-texto-suave">
        No ves ventas, costos ni caja: tu rol es repositor.
      </p>
    </div>
  );
}

/** Inicio: en cinco segundos, cómo viene el día y qué necesita atención. */
export function HomePage() {
  const me = useMe();
  const reports = useGrant("reports");
  const role = me?.member.role;
  const enabled = role === "owner" || role === "manager";
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/api/dashboard"),
    enabled,
    refetchInterval: 60_000,
  });
  // El cajero no ve el panel: entra directo a Vender.
  if (role === "cashier") return <Navigate to="/vender" replace />;
  if (role === "stocker" || reports === "deny") return <StockerHome />;
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <Header />
      {q.isPending ? (
        <SkeletonList rows={6} />
      ) : q.isError ? (
        <ErrorState
          message="El panel del día se ve con conexión. Vender y la caja andan igual."
          onRetry={() => q.refetch()}
        />
      ) : (
        <>
          <Numbers n={q.data.numbers} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <AttentionList items={q.data.attention} />
            <div className="flex flex-col gap-4">
              <Shortcuts />
              <Methods methods={q.data.methods} />
            </div>
          </div>
          <HourChart data={q.data.byHour} />
          <TopAndDeliveries d={q.data} />
          {!q.data.numbers.tickets && !q.data.attention.length && (
            <EmptyState
              title="Todavía no hay ventas hoy"
              body="Cuando vendas, acá ves cómo viene el día."
              icon={<Receipt size={28} aria-hidden />}
            />
          )}
        </>
      )}
    </div>
  );
}
