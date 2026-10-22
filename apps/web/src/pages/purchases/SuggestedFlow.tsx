import { useMutation } from "@tanstack/react-query";
import { Download, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router";
import { ApiError, api, downloadFile } from "../../data/api";
import { Button } from "../../ui/Button";
import { toast } from "../../ui/toast";
import { type SuggestedOrder, SuggestedPage } from "./SuggestedPage";

/** El sugerido con sus acciones: guardar borrador, enviar por WhatsApp o bajar el PDF. */
export function SuggestedFlow() {
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: ({
      o,
      qty,
    }: {
      o: SuggestedOrder;
      qty: Record<string, number>;
      next: "draft" | "send" | "pdf";
    }) => {
      for (const [productId, n] of Object.entries(qty)) {
        const l = (o.lines ?? []).find((x) => x.productId === productId);
        const name = l?.name ?? "Un producto";
        if (n < 0 || !Number.isFinite(n))
          throw new Error(`${name}: la cantidad no puede ser negativa.`);
        if (n > 100_000) throw new Error(`${name}: la cantidad no puede pasar de 100.000.`);
        if (l?.unit === "unit" && !Number.isInteger(n))
          throw new Error(`${name}: se pide por unidad, poné un número entero.`);
      }
      return api<{ id: string; number: number }>("/api/orders", {
        body: {
          supplierId: o.supplierId,
          expectedOn: o.delivery,
          lines: Object.entries(qty)
            .filter(([, n]) => n > 0)
            .map(([productId, n]) => ({ productId, qty: n })),
        },
      });
    },
    onSuccess: async (r, v) => {
      if (v.next === "pdf")
        await downloadFile(
          `/api/orders/${r.id}/pdf`,
          `pedido-${String(r.number).padStart(4, "0")}.pdf`,
        );
      navigate(`/compras/pedidos/${r.id}${v.next === "send" ? "?enviar=1" : ""}`);
    },
    onError: (e) =>
      toast({
        text:
          e instanceof ApiError || e instanceof Error ? e.message : "No se pudo guardar el pedido.",
        tone: "error",
      }),
  });
  return (
    <SuggestedPage
      actions={(o, qty, problem) => (
        <div className="mt-1 flex flex-col gap-2">
          <Button
            icon={<MessageCircle size={18} />}
            busy={create.isPending}
            disabled={Boolean(problem)}
            onClick={() => create.mutate({ o, qty, next: "send" })}
          >
            Enviar por WhatsApp
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={create.isPending || Boolean(problem)}
              onClick={() => create.mutate({ o, qty, next: "draft" })}
            >
              Guardar borrador
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              icon={<Download size={18} />}
              disabled={create.isPending || Boolean(problem)}
              onClick={() => create.mutate({ o, qty, next: "pdf" })}
            >
              Descargar PDF
            </Button>
          </div>
        </div>
      )}
    />
  );
}
