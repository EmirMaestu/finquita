import {
  formatMoney,
  formatTime,
  METHOD_LABEL,
  MOVE_LABEL,
  type PaymentMethodCode,
  shiftName,
  shiftTooLong,
} from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan } from "../../app/session";
import { useViewport } from "../../app/useViewport";
import { loadShiftView } from "../../cash/local";
import { useRegister } from "../../cash/useRegister";
import { useSyncStatus } from "../../sync/status";
import { Button } from "../../ui/Button";
import { Chip, FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { ErrorState, OfflineBanner, Skeleton } from "../../ui/States";
import { MovementSheet } from "./MovementSheet";
import { OpenShift } from "./OpenShift";

function elapsed(from: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 60_000));
  return `${Math.floor(min / 60)} h ${min % 60}`;
}

function signed(cents: number, first: boolean) {
  if (first) return formatMoney(cents);
  return `${cents < 0 ? "−" : "+"} ${formatMoney(Math.abs(cents))}`;
}

/** Caja: abrir turno o turno en curso con el efectivo esperado y sus movimientos. */
export function CashPage() {
  const can = useCan("shift");
  const { layout } = useViewport();
  const desktop = layout === "desktop" || layout === "wide";
  const navigate = useNavigate();
  const reg = useRegister();
  const { version } = useSyncStatus();
  const [sheet, setSheet] = useState<
    null | "withdrawal" | "expense" | "income" | "supplier_payment"
  >(null);
  const [filter, setFilter] = useState<"all" | "cash" | "manual">("all");
  const shift = reg.shift;
  const view = useQuery({
    queryKey: ["shift-view", shift?.id, version],
    placeholderData: (prev) => prev,
    queryFn: () => (shift ? loadShiftView(shift) : null),
    enabled: Boolean(shift),
  });
  // F9 abre retiro o gasto.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F9" && shift) {
        e.preventDefault();
        setSheet("withdrawal");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [shift]);

  if (!can) return <NoPermissionFor perm="shift" />;
  if (!reg.ready) return <Skeleton className="m-6 h-64" />;
  if (!reg.registerId)
    return (
      <ErrorState message="Todavía no bajó la configuración de las cajas. Revisá la conexión." />
    );
  if (!shift) {
    return (
      <div className="p-4 lg:p-6">
        <OpenShift registerId={reg.registerId} registerName={reg.registerName} />
      </div>
    );
  }

  const v = view.data;
  const moves = (v?.moves ?? []).filter((m) =>
    filter === "cash"
      ? m.method === "cash"
      : filter === "manual"
        ? !["sale", "refund", "void"].includes(m.kind)
        : true,
  );
  const methods = (Object.keys(METHOD_LABEL) as PaymentMethodCode[]).filter(
    (m) =>
      (v?.summary.byMethod[m].count ?? 0) > 0 || (v?.summary.byMethod[m].amountCents ?? 0) !== 0,
  );

  // Los renglones de la cuenta pueden repetir texto (dos gastos iguales).
  const lines = (v?.summary.lines ?? []).map((l, n) => ({ ...l, key: `${n}:${l.label}` }));
  const summary = (
    <div className="flex flex-col gap-3">
      <section
        aria-label="Efectivo esperado"
        className="rounded-card border border-borde bg-superficie p-5"
      >
        <div className="text-[13px] text-texto-suave">Efectivo esperado en el cajón</div>
        {v ? (
          <div className="tnum text-[40px] leading-tight font-semibold tracking-[-.02em] lg:text-5xl">
            {formatMoney(v.summary.expectedCashCents)}
          </div>
        ) : (
          <Skeleton className="my-2 h-12 w-48" />
        )}
        <div className="mt-3 flex flex-col text-[15px]">
          {lines.map((l, i) => (
            <div key={l.key} className="flex justify-between border-t border-borde py-1.5">
              <span className="text-texto-suave">{l.label}</span>
              <span className="tnum">{signed(l.amountCents, i === 0)}</span>
            </div>
          ))}
        </div>
      </section>
      <section
        aria-label="Por medio de pago"
        className="rounded-card border border-borde bg-superficie p-5"
      >
        <div className="mb-2 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
          Por medio de pago
        </div>
        {methods.length === 0 && (
          <div className="text-sm text-texto-suave">Todavía no hay ventas en este turno.</div>
        )}
        {methods.map((m) => (
          <div key={m} className="flex justify-between py-1 text-[15px]">
            <span>
              {METHOD_LABEL[m]}{" "}
              <span className="text-texto-suave">· {v?.summary.byMethod[m].count} op.</span>
            </span>
            <span className="tnum font-semibold">
              {formatMoney(v?.summary.byMethod[m].amountCents ?? 0)}
            </span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-borde pt-2 font-semibold">
          <span>Ventas del turno</span>
          <span className="tnum">{formatMoney(v?.summary.salesCents ?? 0)}</span>
        </div>
      </section>
    </div>
  );

  const list = (
    <section
      aria-label="Movimientos"
      className="flex min-h-0 flex-col overflow-hidden rounded-card border border-borde bg-superficie"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-3">
        <span className="font-semibold">Movimientos</span>
        <span className="text-texto-suave">· {v?.moves.length ?? 0}</span>
        <span className="flex-1" />
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          Todos
        </FilterChip>
        <FilterChip active={filter === "cash"} onClick={() => setFilter("cash")}>
          Solo efectivo
        </FilterChip>
        <FilterChip active={filter === "manual"} onClick={() => setFilter("manual")}>
          Manuales
        </FilterChip>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {moves.map((m) => (
          <li
            key={m.id}
            className="grid grid-cols-[48px_auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-borde px-4 py-2 text-sm last:border-b-0 lg:grid-cols-[48px_130px_minmax(0,1fr)_90px_100px]"
          >
            <span className="tnum text-texto-suave">{formatTime(new Date(m.at))}</span>
            <Chip>{MOVE_LABEL[m.kind]}</Chip>
            <span className="truncate">
              {m.reason ?? ""}
              {m.authorizedByName ? ` · autorizó ${m.authorizedByName}` : ""}
              {m.source === "local" ? " · sin sincronizar" : ""}
            </span>
            <span className="hidden text-texto-suave lg:inline">{METHOD_LABEL[m.method]}</span>
            <span
              className={cx("tnum text-right font-semibold", m.amountCents < 0 && "text-peligro")}
            >
              {signed(m.amountCents, false)}
            </span>
          </li>
        ))}
        {v && moves.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-texto-suave">
            Sin movimientos todavía.
          </li>
        )}
      </ul>
    </section>
  );

  return (
    <div className={cx("flex flex-col gap-4 p-4 lg:p-6", desktop && "h-full")}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold">
          {reg.registerName} · {shiftName(new Date(shift.openedAt))}
        </h1>
        <span className="text-texto-suave">
          {reg.cashierName ? `${reg.cashierName} · ` : ""}Abierto{" "}
          {formatTime(new Date(shift.openedAt))} · {elapsed(shift.openedAt)}
        </span>
        <span className="flex-1" />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSheet("withdrawal")}>
            Retiro{desktop ? " · F9" : ""}
          </Button>
          <Button variant="secondary" onClick={() => setSheet("expense")}>
            Gasto
          </Button>
          <Button variant="secondary" onClick={() => setSheet("income")}>
            Ingreso
          </Button>
          <Button variant="ghost" onClick={() => navigate("/caja/historial")}>
            Historial
          </Button>
          <Button onClick={() => navigate("/caja/cierre")}>Arqueo y cierre</Button>
        </div>
      </div>
      {v?.offline && (
        <OfflineBanner>
          Sin conexión: lo de otros dispositivos se ve al volver internet. Lo tuyo ya está sumado.
        </OfflineBanner>
      )}
      {shiftTooLong(new Date(shift.openedAt)) && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg bg-alerta-suave px-3 py-2 text-sm font-semibold text-alerta"
        >
          <TriangleAlert size={16} aria-hidden /> Este turno está abierto hace más de 14 horas. ¿Te
          olvidaste de cerrar?
        </div>
      )}
      {view.isError && <ErrorState onRetry={() => view.refetch()} />}
      {desktop ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px] gap-4">
          {list}
          <div className="min-h-0 overflow-y-auto">{summary}</div>
        </div>
      ) : (
        <>
          {summary}
          {list}
        </>
      )}
      {sheet && (
        <MovementSheet
          open
          initialKind={sheet}
          onClose={() => setSheet(null)}
          shiftId={shift.id}
          expectedCashCents={v?.summary.expectedCashCents ?? 0}
          registerName={reg.registerName}
        />
      )}
    </div>
  );
}
