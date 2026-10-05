import { formatDate, formatQty } from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useGrant } from "../../app/session";
import { api } from "../../data/api";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";

type Lot = {
  id: string;
  productId: string;
  productName: string;
  code: string | null;
  expiresOn: string;
  qtyRemaining: number;
  saleUnit: "unit" | "kg" | "100g";
  expired: boolean;
};

/** Vencimientos por fecha: vencidos, en 7 días y en 30 días, con acciones. */
export function ExpiryPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canRemove = useGrant("adjust_stock") === "allow";
  const q = useQuery({ queryKey: ["lots"], queryFn: () => api<Lot[]>("/api/lots?within=30") });
  const remove = useMutation({
    mutationFn: (a: { id: string; action: "waste" | "supplier" }) =>
      api(`/api/lots/${a.id}/remove`, { body: { action: a.action } }),
    onSuccess: async (_r, a) => {
      toast({ text: a.action === "waste" ? "Dado de baja como merma" : "Devuelto al proveedor" });
      await qc.invalidateQueries({ queryKey: ["lots"] });
    },
  });
  const days = (d: string) =>
    Math.round((new Date(`${d}T12:00:00-03:00`).getTime() - Date.now()) / 86_400_000);
  const groups: [string, (l: Lot) => boolean][] = [
    ["Vencidos", (l) => l.expired],
    ["En 7 días", (l) => !l.expired && days(l.expiresOn) <= 7],
    ["En 30 días", (l) => !l.expired && days(l.expiresOn) > 7],
  ];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <h1 className="m-0 text-[22px] font-semibold">Vencimientos</h1>
      {q.isPending ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState title="Nada vence en los próximos 30 días" />
      ) : (
        groups.map(([title, fn]) => {
          const list = q.data.filter(fn);
          if (!list.length) return null;
          return (
            <section
              key={title}
              aria-label={title}
              className="overflow-hidden rounded-card border border-borde bg-superficie"
            >
              <div className="border-b border-borde px-4 py-2.5 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
                {title}
              </div>
              {list.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center gap-3 border-b border-borde px-4 py-3 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{l.productName}</span>
                    <span className="block text-[13px] text-texto-suave">
                      {l.code ? `Lote ${l.code} · ` : ""}
                      {formatQty(l.qtyRemaining, l.saleUnit === "unit" ? "unit" : "kg")}
                    </span>
                  </span>
                  <Chip tone={l.expired ? "peligro" : "alerta"}>
                    {l.expired
                      ? `Venció ${formatDate(l.expiresOn).slice(0, 5)}`
                      : `Vence ${formatDate(l.expiresOn).slice(0, 5)}`}
                  </Chip>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => navigate(`/productos/promociones?producto=${l.productId}`)}
                    >
                      Poner en oferta
                    </Button>
                    {canRemove && (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => remove.mutate({ id: l.id, action: "supplier" })}
                        >
                          Devolver
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => remove.mutate({ id: l.id, action: "waste" })}
                        >
                          Dar de baja
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
