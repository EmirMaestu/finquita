import { formatDate, formatMoney, formatQty, formatTime } from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGrant } from "../../app/session";
import { api } from "../../data/api";
import { ADJUST_REASONS } from "../../data/stock";
import { useSyncStatus } from "../../sync/status";
import { Button } from "../../ui/Button";
import { Chip, FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";

type Move = {
  id: string;
  kind: string;
  qty: number;
  resultingQty: number | null;
  reason: string | null;
  note: string | null;
  status: "applied" | "pending" | "rejected";
  productName: string;
  saleUnit: "unit" | "kg" | "100g";
  memberName: string | null;
  createdAt: string;
  refType: string | null;
  valueCents?: number;
};

const KIND_LABEL: Record<string, string> = {
  sale: "Venta",
  return: "Devolución",
  receipt: "Recepción",
  adjustment: "Ajuste",
  waste: "Merma",
  count: "Conteo",
  void: "Anulación",
};

const KINDS = ["sale", "receipt", "adjustment", "waste", "return", "count"] as const;

/** Movimientos de stock, general; y los ajustes del repositor para aprobar. */
export function MovementsPage() {
  const qc = useQueryClient();
  const canApprove = useGrant("adjust_stock") === "allow";
  const { version } = useSyncStatus();
  const [kind, setKind] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["movements", kind, version],
    queryFn: () => api<Move[]>(`/api/stock/movements?limit=200${kind ? `&kind=${kind}` : ""}`),
    placeholderData: (p) => p,
  });
  const pending = useQuery({
    queryKey: ["pending", version],
    queryFn: () => api<Move[]>("/api/stock/pending"),
    enabled: canApprove,
  });
  const review = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api(`/api/stock/movements/${id}/review`, { body: { approve } }),
    onSuccess: () =>
      qc
        .invalidateQueries({ queryKey: ["pending"] })
        .then(() => qc.invalidateQueries({ queryKey: ["movements"] })),
  });
  const qty = (m: Move) =>
    `${m.qty > 0 ? "+" : "−"}${formatQty(Math.abs(m.qty), m.saleUnit === "unit" ? "unit" : "kg")}`;
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="m-0 text-[22px] font-semibold">Movimientos de stock</h1>
      {canApprove && (pending.data?.length ?? 0) > 0 && (
        <section
          aria-label="Para aprobar"
          className="rounded-card border border-alerta bg-superficie"
        >
          <div className="border-b border-borde px-4 py-2.5 font-semibold text-alerta">
            Ajustes para aprobar · {pending.data?.length}
          </div>
          <ul className="m-0 list-none p-0">
            {pending.data?.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-3 border-b border-borde px-4 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{m.productName}</span>
                  <span className="block text-[13px] text-texto-suave">
                    {m.memberName} ·{" "}
                    {ADJUST_REASONS[m.reason as keyof typeof ADJUST_REASONS] ?? m.reason}
                    {m.note ? ` · ${m.note}` : ""}
                  </span>
                </span>
                <span
                  className={cx("tnum font-semibold", m.qty < 0 ? "text-peligro" : "text-exito")}
                >
                  {qty(m)}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => review.mutate({ id: m.id, approve: false })}
                >
                  Rechazar
                </Button>
                <Button onClick={() => review.mutate({ id: m.id, approve: true })}>Aprobar</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={!kind} onClick={() => setKind(null)}>
          Todos
        </FilterChip>
        {KINDS.map((k) => (
          <FilterChip key={k} active={kind === k} onClick={() => setKind(k)}>
            {KIND_LABEL[k]}
          </FilterChip>
        ))}
      </div>
      {list.isPending ? (
        <SkeletonList />
      ) : list.isError ? (
        <ErrorState message="Los movimientos se ven con conexión." onRetry={() => list.refetch()} />
      ) : !list.data.length ? (
        <EmptyState title="Sin movimientos" />
      ) : (
        <table
          className="block w-full overflow-hidden rounded-card border border-borde bg-superficie"
          aria-label="Movimientos"
        >
          <tbody className="block">
            {list.data.map((m) => (
              <tr
                key={m.id}
                className="grid grid-cols-[1fr_auto] items-center gap-2 border-b border-borde px-4 py-2 text-sm last:border-b-0 lg:grid-cols-[110px_120px_minmax(0,1fr)_90px_90px_110px]"
              >
                <td className="tnum text-texto-suave">
                  {formatDate(new Date(m.createdAt)).slice(0, 5)}{" "}
                  {formatTime(new Date(m.createdAt))}
                </td>
                <td>
                  <Chip
                    tone={
                      m.status === "pending"
                        ? "alerta"
                        : m.status === "rejected"
                          ? "peligro"
                          : "neutro"
                    }
                  >
                    {KIND_LABEL[m.kind] ?? m.kind}
                    {m.status === "pending"
                      ? " · para aprobar"
                      : m.status === "rejected"
                        ? " · rechazado"
                        : ""}
                  </Chip>
                </td>
                <td className="col-span-2 truncate lg:col-span-1">
                  {m.productName}
                  <span className="text-texto-suave">
                    {m.reason
                      ? ` · ${ADJUST_REASONS[m.reason as keyof typeof ADJUST_REASONS] ?? m.reason}`
                      : ""}
                    {m.memberName ? ` · ${m.memberName}` : ""}
                  </span>
                </td>
                <td
                  className={cx(
                    "tnum text-right font-semibold",
                    m.qty < 0 ? "text-peligro" : "text-exito",
                  )}
                >
                  {qty(m)}
                </td>
                <td className="tnum text-right text-texto-suave">
                  {m.resultingQty !== null
                    ? formatQty(m.resultingQty, m.saleUnit === "unit" ? "unit" : "kg")
                    : "—"}
                </td>
                <td className="tnum hidden text-right text-texto-suave lg:block">
                  {m.valueCents !== undefined ? formatMoney(m.valueCents) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
