import { formatMoney, formatPercent } from "@mostrador/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useGrant } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { localDb } from "../../data/db";
import { useLive } from "../../data/live";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { SelectField, TextField, Toggle } from "../../ui/Field";
import { toast } from "../../ui/toast";
import { readSheetFile } from "../products/ImportPage";
import { PurchasesTabs } from "./PurchasesTabs";
import type { Supplier } from "./SuppliersPage";

type Row = { code: string | null; description: string; costCents: number };
type Match = {
  index: number;
  code: string | null;
  description: string;
  productId: string;
  name: string;
  priceCents: number;
  oldCostCents: number | null;
  newCostCents: number;
  changeBp: number | null;
};
type Preview = { matched: Match[]; unmatched: (Row & { index: number })[]; changed: number };

/** "$ 2.100,50", "2100,5" o "2100.5" (Excel) → centavos. */
export function cellCents(v: string): number | null {
  const t = v.replace(/[$\s]/g, "");
  if (!t) return null;
  const n = /^\d+(\.\d+)?$/.test(t) ? Number(t) : Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const guess = (headers: string[], words: RegExp) =>
  Math.max(
    0,
    headers.findIndex((h) => words.test(h.toLowerCase())),
  );

/** Lista de precios del proveedor: importar su Excel, relacionar códigos y ver qué costos cambian. */
export function PriceListPage() {
  const can = useGrant("view_costs") === "allow";
  const navigate = useNavigate();
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<Supplier[]>("/api/suppliers"),
    enabled: can,
  });
  const [supplierId, setSupplierId] = useState("");
  const [sheet, setSheet] = useState<string[][] | null>(null);
  const [cols, setCols] = useState({ code: 0, description: 1, cost: 2 });
  const [vatIncluded, setVatIncluded] = useState(true);
  const [discount, setDiscount] = useState("0");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const headers = sheet?.[0] ?? [];
  const rows: Row[] = (sheet ?? [])
    .slice(1)
    .map((r) => ({
      code: r[cols.code]?.trim() || null,
      description: r[cols.description]?.trim() ?? "",
      costCents: cellCents(r[cols.cost] ?? "") ?? -1,
    }))
    .filter((r) => r.costCents >= 0 && (r.code || r.description));
  const terms = {
    vatIncluded,
    vatBp: 2100,
    discountBp: Math.round((Number(discount.replace(",", ".")) || 0) * 100),
  };
  const preview = useMutation({
    mutationFn: () =>
      api<Preview>(`/api/suppliers/${supplierId}/price-list/preview`, {
        body: { terms, rows, links },
      }),
    onError: (e) => setError(e instanceof ApiError ? e.message : "No se pudo leer la lista."),
  });
  const apply = useMutation({
    mutationFn: () =>
      api<{ updated: number; changed: string[] }>(`/api/suppliers/${supplierId}/price-list/apply`, {
        body: {
          items: (preview.data?.matched ?? []).map((m) => ({
            productId: m.productId,
            supplierCode: m.code,
            costCents: m.newCostCents,
          })),
        },
      }),
    onSuccess: (r) =>
      toast({
        text: `Costos guardados: ${r.changed.length} cambiaron y quedan con "Revisar precio"`,
      }),
  });
  const found = useLive(
    async () => {
      const q = search.trim().toLowerCase();
      if (q.length < 2) return [];
      return (
        await localDb()
          .products.filter((p) => p.name.toLowerCase().includes(q))
          .limit(6)
          .toArray()
      ).map((p) => ({ id: p.id, name: p.name }));
    },
    [search],
    [],
  );
  if (!can) return <NoPermissionFor perm="view_costs" />;
  const m = preview.data;
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold">Compras</h1>
        <PurchasesTabs />
      </div>
      <h2 className="m-0 text-lg font-semibold">Lista de precios del proveedor</h2>
      <div className="grid gap-3 rounded-card border border-borde bg-superficie p-4 lg:grid-cols-2">
        <SelectField
          label="Proveedor"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="">Elegí</option>
          {(suppliers.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
          Archivo (.xlsx o .csv)
          <span className="flex h-12 items-center gap-2 rounded-lg border border-dashed border-borde-fuerte px-3">
            <FileSpreadsheet size={18} aria-hidden />
            <input
              type="file"
              accept=".xlsx,.csv,.txt"
              aria-label="Archivo de la lista"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const s = await readSheetFile(f);
                  const h = s[0] ?? [];
                  setSheet(s);
                  setCols({
                    code: guess(h, /c[oó]d|art|sku|ean/),
                    description: guess(h, /desc|prod|nombre|art[ií]culo/),
                    cost: guess(h, /costo|precio|lista|importe/),
                  });
                  setError(null);
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </span>
        </label>
        {sheet && (
          <>
            {(["code", "description", "cost"] as const).map((k) => (
              <SelectField
                key={k}
                label={
                  k === "code"
                    ? "Columna del código"
                    : k === "description"
                      ? "Columna de la descripción"
                      : "Columna del costo"
                }
                value={String(cols[k])}
                onChange={(e) => setCols((c) => ({ ...c, [k]: Number(e.target.value) }))}
              >
                {headers.map((h, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: la columna es su posición en la planilla
                  <option key={i} value={i}>
                    {h || `Columna ${i + 1}`}
                  </option>
                ))}
              </SelectField>
            ))}
            <TextField
              label="Bonificación %"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <Toggle
              label="Los costos vienen con IVA"
              checked={vatIncluded}
              onChange={setVatIncluded}
            />
          </>
        )}
        {error && (
          <div role="alert" className="text-sm font-semibold text-peligro lg:col-span-2">
            {error}
          </div>
        )}
        <Button
          className="self-end"
          disabled={!supplierId || !rows.length || preview.isPending}
          onClick={() => preview.mutate()}
        >
          Ver qué cambia ({rows.length} filas)
        </Button>
      </div>
      {m && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              <strong>{m.matched.length}</strong> relacionados · <strong>{m.changed}</strong>{" "}
              cambian de costo · <strong>{m.unmatched.length}</strong> sin relacionar
            </span>
            <span className="flex-1" />
            <Button disabled={!m.matched.length || apply.isPending} onClick={() => apply.mutate()}>
              Guardar costos
            </Button>
            {apply.isSuccess && (
              <Button
                variant="secondary"
                onClick={() => navigate(`/productos/precios?proveedor=${supplierId}`)}
              >
                Ir al cambio masivo de precios
              </Button>
            )}
          </div>
          <div className="overflow-x-auto rounded-card border border-borde bg-superficie">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-texto-suave">
                  <th className="px-4 py-2">Producto</th>
                  <th className="px-2 py-2">Código</th>
                  <th className="px-2 py-2 text-right">Costo actual</th>
                  <th className="px-2 py-2 text-right">Costo nuevo</th>
                  <th className="px-4 py-2 text-right">Cambio</th>
                </tr>
              </thead>
              <tbody>
                {m.matched.map((x) => (
                  <tr key={x.index} className="border-t border-borde">
                    <td className="px-4 py-2">{x.name}</td>
                    <td className="px-2 text-texto-suave">{x.code ?? "—"}</td>
                    <td className="tnum px-2 text-right whitespace-nowrap">
                      {x.oldCostCents != null ? formatMoney(x.oldCostCents) : "—"}
                    </td>
                    <td className="tnum px-2 text-right font-semibold whitespace-nowrap">
                      {formatMoney(x.newCostCents)}
                    </td>
                    <td className="px-4 text-right">
                      {x.changeBp ? (
                        <Chip tone={x.changeBp > 0 ? "alerta" : "ok"}>
                          {x.changeBp > 0 ? "+" : "−"}
                          {formatPercent(Math.abs(x.changeBp))}
                        </Chip>
                      ) : (
                        <span className="text-texto-suave">igual</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m.unmatched.length > 0 && (
            <section
              aria-label="Sin relacionar"
              className="rounded-card border border-borde bg-superficie"
            >
              <div className="border-b border-borde px-4 py-2.5 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
                Sin relacionar
              </div>
              {m.unmatched.slice(0, 100).map((u) => (
                <div
                  key={u.index}
                  className="flex flex-wrap items-center gap-3 border-b border-borde px-4 py-2 text-sm last:border-b-0"
                >
                  <span className="flex-1">
                    {u.description}{" "}
                    <span className="text-texto-suave">{u.code ? `· ${u.code}` : ""}</span>
                  </span>
                  <span className="tnum">{formatMoney(u.costCents)}</span>
                  {linking === u.index ? (
                    <span className="flex w-full flex-col gap-1">
                      <TextField
                        label="Buscar el producto"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                      {found.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="rounded-md px-2 py-1.5 text-left hover:bg-neutro-suave"
                          onClick={() => {
                            setLinks((l) => ({ ...l, [String(u.index)]: p.id }));
                            setLinking(null);
                            setSearch("");
                          }}
                        >
                          {p.name}
                        </button>
                      ))}
                    </span>
                  ) : (
                    <Button variant="secondary" onClick={() => setLinking(u.index)}>
                      Relacionar
                    </Button>
                  )}
                </div>
              ))}
              {Object.keys(links).length > 0 && (
                <div className="p-3">
                  <Button variant="secondary" onClick={() => preview.mutate()}>
                    Volver a calcular con lo relacionado
                  </Button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
