import { formatMoney } from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { api } from "../../data/api";
import { Button } from "../../ui/Button";
import { Ean13 } from "../../ui/Ean13";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";

type Item = {
  id: string;
  name: string;
  plu: string;
  code: string;
  priceCents: number;
  saleUnit: string;
  category: string | null;
};

/**
 * Planilla de códigos: una hoja con el código interno de cada producto sin código de barras,
 * para escanearlo con la pistola (pan, fiambres, huevos sueltos).
 */
export function CodeSheetPage() {
  const q = useQuery({ queryKey: ["code-sheet"], queryFn: () => api<Item[]>("/api/labels/codes") });
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 lg:p-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div className="flex-1">
          <h1 className="m-0 text-[22px] font-semibold">Planilla de códigos</h1>
          <p className="m-0 text-sm text-texto-suave">
            Lo que no tiene código de barras, con su código interno (empieza con 2). Pegala cerca de
            la caja.
          </p>
        </div>
        <a
          href="/api/labels/codes.pdf"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-borde bg-superficie px-4 text-sm font-semibold text-texto no-underline"
        >
          <Download size={18} aria-hidden /> PDF
        </a>
        <Button icon={<Printer size={18} />} onClick={() => window.print()}>
          Imprimir
        </Button>
      </div>
      {q.isPending ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          title="Todos tus productos tienen código de barras"
          body="Cuando cargues pesables o productos sin código, aparecen acá."
        />
      ) : (
        <section
          className="a4-sheet grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-3 print:gap-1"
          aria-label="Planilla"
        >
          {q.data.map((i) => (
            <div
              key={i.id}
              className="flex break-inside-avoid flex-col gap-1 rounded-lg border border-borde bg-white p-3 text-black"
            >
              <span className="truncate text-sm font-semibold">{i.name}</span>
              <span className="text-xs">
                {formatMoney(i.priceCents)}
                {i.saleUnit === "kg" ? " / kg" : ""} · PLU {i.plu}
              </span>
              <Ean13 code={i.code} className="h-16 w-full" />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
