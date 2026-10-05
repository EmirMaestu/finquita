import {
  closingLines,
  formatDate,
  formatMoney,
  formatTime,
  METHOD_LABEL,
  type PaymentMethodCode,
  type ShiftSummary,
  shiftName,
  signedMoney,
  toDateStr,
} from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { NoPermissionFor } from "../../app/guards";
import { useCan, useMe } from "../../app/session";
import { api } from "../../data/api";
import { useSettings } from "../../data/settings";
import { FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import { ClosingReceipt } from "./ClosingReceipt";

type ShiftRow = {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  memberName: string;
  salesCents: number;
  differenceCents: number | null;
  countedCashCents: number | null;
};

type ShiftDetail = {
  shift: ShiftRow & {
    registerName: string;
    expectedCashCents: number | null;
    leftFloatCents: number | null;
    withdrawnCents: number | null;
    closeNote: string | null;
  };
  summary: ShiftSummary;
};

function Receipt({ id }: { id: string }) {
  const me = useMe();
  const settings = useSettings();
  const q = useQuery({
    queryKey: ["shift-detail", id],
    queryFn: () => api<ShiftDetail>(`/api/shifts/${id}`),
  });
  if (q.isPending) return <SkeletonList rows={4} />;
  if (q.isError || !q.data) return <ErrorState onRetry={() => q.refetch()} />;
  const { shift: s, summary } = q.data;
  if (s.status === "open")
    return <div className="p-4 text-sm text-texto-suave">El turno sigue abierto.</div>;
  const lines = closingLines(
    {
      business: me?.business ?? { name: "Mostrador" },
      registerName: s.registerName,
      shiftLabel: shiftName(new Date(s.openedAt)),
      cashier: s.memberName,
      openedAt: new Date(s.openedAt),
      closedAt: new Date(s.closedAt ?? s.openedAt),
      lines: summary.lines,
      expectedCashCents: s.expectedCashCents ?? summary.expectedCashCents,
      countedCashCents: s.countedCashCents ?? 0,
      differenceCents: s.differenceCents ?? 0,
      byMethod: (Object.keys(METHOD_LABEL) as PaymentMethodCode[])
        .filter((m) => summary.byMethod[m].count > 0)
        .map((m) => ({
          label: METHOD_LABEL[m],
          amountCents: summary.byMethod[m].amountCents,
          count: summary.byMethod[m].count,
        })),
      salesCents: summary.salesCents,
      leftFloatCents: s.leftFloatCents ?? 0,
      withdrawnCents: s.withdrawnCents ?? 0,
      note: s.closeNote,
    },
    settings.tickets.width,
  );
  return <ClosingReceipt lines={lines} />;
}

/** Historial de cierres: por fecha, con turno, cajero, ventas y diferencia en color. */
export function ClosingsPage() {
  const can = useCan("shift");
  const [daily, setDaily] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["closings"],
    queryFn: () => api<ShiftRow[]>("/api/shifts?limit=60"),
  });
  if (!can) return <NoPermissionFor perm="shift" />;
  const rows = q.data ?? [];
  // Día completo: suma los turnos de cada fecha.
  const days = Object.values(
    rows.reduce<
      Record<string, { date: string; salesCents: number; differenceCents: number; shifts: number }>
    >((acc, r) => {
      const d = toDateStr(new Date(r.openedAt));
      const cur = acc[d] ?? { date: d, salesCents: 0, differenceCents: 0, shifts: 0 };
      cur.salesCents += r.salesCents;
      cur.differenceCents += r.differenceCents ?? 0;
      cur.shifts++;
      acc[d] = cur;
      return acc;
    }, {}),
  );
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-[22px] font-semibold">Historial de cierres</h1>
        <FilterChip active={!daily} onClick={() => setDaily(false)}>
          Por turno
        </FilterChip>
        <FilterChip active={daily} onClick={() => setDaily(true)}>
          Día completo
        </FilterChip>
      </div>
      {q.isPending ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState
          message="El historial de cierres necesita internet."
          onRetry={() => q.refetch()}
        />
      ) : !rows.length ? (
        <EmptyState title="Todavía no hay cierres" />
      ) : (
        <div className={cx("grid gap-4", open ? "lg:grid-cols-[minmax(0,1fr)_420px]" : "")}>
          <ul
            className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
            aria-label="Cierres"
          >
            {daily
              ? days.map((d) => (
                  <li
                    key={d.date}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-borde px-4 py-3 last:border-b-0"
                  >
                    <span>
                      <span className="font-semibold">{formatDate(d.date)}</span>
                      <span className="block text-[13px] text-texto-suave">{d.shifts} turnos</span>
                    </span>
                    <span className="tnum">{formatMoney(d.salesCents)}</span>
                    <span
                      className={cx(
                        "tnum font-semibold",
                        d.differenceCents < 0
                          ? "text-peligro"
                          : d.differenceCents > 0
                            ? "text-exito"
                            : "",
                      )}
                    >
                      {signedMoney(d.differenceCents)}
                    </span>
                  </li>
                ))
              : rows.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(r.id)}
                      className={cx(
                        "grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-borde px-4 py-3 text-left",
                        open === r.id && "bg-primario-suave/60",
                      )}
                    >
                      <span>
                        <span className="font-semibold">
                          {formatDate(new Date(r.openedAt))} · {shiftName(new Date(r.openedAt))}
                        </span>
                        <span className="block text-[13px] text-texto-suave">
                          {r.memberName} · {formatTime(new Date(r.openedAt))}
                          {r.closedAt ? ` a ${formatTime(new Date(r.closedAt))}` : " · abierto"}
                        </span>
                      </span>
                      <span className="tnum">{formatMoney(r.salesCents)}</span>
                      <span
                        className={cx(
                          "tnum min-w-20 text-right font-semibold",
                          (r.differenceCents ?? 0) < 0
                            ? "text-peligro"
                            : (r.differenceCents ?? 0) > 0
                              ? "text-exito"
                              : "",
                        )}
                      >
                        {r.status === "open" ? "—" : signedMoney(r.differenceCents ?? 0)}
                      </span>
                    </button>
                  </li>
                ))}
          </ul>
          {open && !daily && (
            <aside
              aria-label="Comprobante"
              className="rounded-card border border-borde bg-superficie"
            >
              <Receipt key={open} id={open} />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
