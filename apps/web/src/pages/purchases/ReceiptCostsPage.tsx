import { costChange, formatQty, parseMoney } from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useGrant } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { useSettings } from "../../data/settings";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/Field";
import { ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";

type RLine = {
  id: string;
  name: string;
  unit: "unit" | "kg";
  qty: number;
  damagedQty: number;
  priceCents: number;
  previousCostCents: number | null;
  marginBp: number;
};
type Receipt = { id: string; costsPending: boolean; lines: RLine[] };

/** El dueño (o quien ve costos) completa los costos de lo que recibió el repositor. */
export function ReceiptCostsPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const settings = useSettings();
  const can = useGrant("view_costs") === "allow";
  const q = useQuery({
    queryKey: ["receipt", id],
    queryFn: () => api<Receipt>(`/api/receipts/${id}`),
    enabled: can,
  });
  const [cost, setCost] = useState<Record<string, string>>({});
  const [price, setPrice] = useState<Record<string, number | null>>({});
  const [invoice, setInvoice] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api(`/api/receipts/${id}/costs`, {
        body: {
          lines: (q.data?.lines ?? []).map((l) => ({
            lineId: l.id,
            unitCostCents: cost[l.id]
              ? (parseMoney(cost[l.id] ?? "") ?? l.previousCostCents ?? 0)
              : (l.previousCostCents ?? 0),
            newPriceCents: price[l.id] ?? null,
          })),
          invoiceNumber: invoice || null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["receipts-costs"] });
      toast({ text: "Costos guardados: quedó la cuenta a pagar" });
      navigate("/compras/recepcion");
    },
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo guardar.", tone: "error" }),
  });
  if (!can) return <NoPermissionFor perm="view_costs" />;
  if (q.isPending) return <SkeletonList className="p-6" />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <h1 className="m-0 text-[22px] font-semibold">Completar costos</h1>
      <p className="m-0 text-sm text-texto-suave">
        Lo que cambió de costo sin tocar el precio queda con "Revisar precio".
      </p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {q.data.lines.map((l) => {
          const value =
            cost[l.id] ??
            (l.previousCostCents != null
              ? String(l.previousCostCents / 100).replace(".", ",")
              : "");
          const ch = costChange({
            previousCostCents: l.previousCostCents,
            costCents: parseMoney(value),
            priceCents: l.priceCents,
            marginBp: l.marginBp,
            roundingCents: settings.pricing.roundingCents,
          });
          return (
            <li
              key={l.id}
              className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-4"
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{l.name}</span>
                <span className="tnum text-texto-suave">
                  {formatQty(l.qty - l.damagedQty, l.unit)}
                </span>
              </div>
              <TextField
                label={`Costo ${l.name}`}
                inputMode="decimal"
                value={value}
                onChange={(e) => setCost((c) => ({ ...c, [l.id]: e.target.value }))}
              />
              {ch && (
                <div
                  role="status"
                  className="flex flex-col gap-2 rounded-lg border border-alerta bg-alerta-suave p-3 text-sm"
                >
                  <strong>{ch.text}</strong>
                  <span>{ch.priceText}</span>
                  <label className="flex items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={price[l.id] != null}
                      onChange={(e) =>
                        setPrice((p) => ({
                          ...p,
                          [l.id]: e.target.checked ? ch.suggestedPriceCents : null,
                        }))
                      }
                    />
                    Actualizar precio
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <TextField
        label="Número de factura o remito"
        value={invoice}
        onChange={(e) => setInvoice(e.target.value)}
        placeholder="Opcional"
      />
      <Button
        size="lg"
        className="self-start"
        onClick={() => save.mutate()}
        disabled={save.isPending || !q.data.costsPending}
      >
        Guardar costos
      </Button>
    </div>
  );
}
