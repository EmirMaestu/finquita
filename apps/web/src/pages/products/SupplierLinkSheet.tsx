import { formatMoney, moneyInput, parseMoney } from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useCan, useGrant } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { Button } from "../../ui/Button";
import { SelectField, TextField, Toggle } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { toast } from "../../ui/toast";

/** Vínculo producto–proveedor: código y costo del proveedor, bulto y si es el principal. */
export type SupplierLink = {
  supplierId: string;
  productId: string;
  supplierName?: string;
  productName?: string;
  supplierCode: string | null;
  costCents?: number | null;
  packQty: number | null;
  isPrimary: boolean;
};

export type SupplierLinkBody = {
  productId: string;
  supplierCode?: string | null;
  costCents?: number | null;
  packQty?: number | null;
  isPrimary?: boolean;
};

/** Vincular productos con proveedores pide el permiso completo de armar pedidos. */
export function useCanLinkSuppliers() {
  return useGrant("build_orders") === "allow";
}

export function saveSupplierLink(supplierId: string, body: SupplierLinkBody) {
  return api(`/api/suppliers/${supplierId}/products`, { method: "PUT", body });
}

function errorText(e: unknown, fallback: string) {
  return e instanceof ApiError ? e.message : fallback;
}

/** Guardar, hacer principal y quitar, con las listas y fichas al día. */
export function useSupplierLinkActions() {
  const qc = useQueryClient();
  const refresh = async (supplierId: string, productId: string) => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["product", productId] }),
      qc.invalidateQueries({ queryKey: ["products"] }),
      qc.invalidateQueries({ queryKey: ["supplier", supplierId] }),
      qc.invalidateQueries({ queryKey: ["suppliers"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: ({ supplierId, body }: { supplierId: string; body: SupplierLinkBody }) =>
      saveSupplierLink(supplierId, body),
    onSuccess: (_d, v) => refresh(v.supplierId, v.body.productId),
  });
  const remove = useMutation({
    mutationFn: ({ supplierId, productId }: { supplierId: string; productId: string }) =>
      api(`/api/suppliers/${supplierId}/products/${productId}`, { method: "DELETE" }),
    onSuccess: (_d, v) => refresh(v.supplierId, v.productId),
  });
  const makePrimary = (l: SupplierLink) =>
    save.mutate(
      { supplierId: l.supplierId, body: { productId: l.productId, isPrimary: true } },
      {
        onSuccess: () => toast({ text: `${l.supplierName ?? "Proveedor"} quedó como principal` }),
        onError: (e) => toast({ text: errorText(e, "No se pudo cambiar."), tone: "error" }),
      },
    );
  return { save, remove, makePrimary };
}

function parseQty(s: string): number | null | undefined {
  if (!s.trim()) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function qtyInput(n: number | null | undefined) {
  return n == null ? "" : String(n).replace(".", ",");
}

type PickedProduct = {
  id: string;
  name: string;
  costCents?: number | null;
  supplierName?: string | null;
};

/** Buscador simple de productos (por nombre o código) para el lado del proveedor. */
function ProductSearch({
  value,
  onPick,
}: {
  value: { id: string; name: string } | null;
  onPick: (p: PickedProduct | null) => void;
}) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const found = useQuery({
    queryKey: ["supplier-link-search", term],
    queryFn: () =>
      api<{ items: PickedProduct[] }>(`/api/products?q=${encodeURIComponent(term)}&limit=8`),
    enabled: term.length > 1 && !value,
  });
  if (value)
    return (
      <div className="flex flex-col gap-1.5 text-[13px] font-semibold">
        Producto
        <div className="flex min-h-12 items-center gap-2 rounded-lg border border-borde px-3">
          <span className="flex-1 text-[15px] font-medium">{value.name}</span>
          <Button variant="ghost" onClick={() => onPick(null)}>
            Cambiar
          </Button>
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <TextField
        label="Producto"
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Buscá por nombre o código"
      />
      {term.length > 1 && (
        <ul
          aria-label="Productos encontrados"
          className="m-0 list-none overflow-hidden rounded-lg border border-borde p-0"
        >
          {found.isPending ? (
            <li className="px-3 py-2.5 text-sm text-texto-suave">Buscando…</li>
          ) : found.isError ? (
            <li className="px-3 py-2.5 text-sm text-peligro">No pudimos buscar. Probá de nuevo.</li>
          ) : !found.data.items.length ? (
            <li className="px-3 py-2.5 text-sm text-texto-suave">No encontramos ese producto.</li>
          ) : (
            found.data.items.map((p) => (
              <li key={p.id} className="border-b border-borde last:border-b-0">
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="flex min-h-12 w-full items-center px-3 text-left text-[15px] hover:bg-neutro-suave"
                >
                  {p.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Hoja para agregar o editar el vínculo producto–proveedor. Desde la ficha del producto
 * se elige el proveedor; desde la del proveedor, el producto. Al editar, también quita.
 */
export function SupplierLinkSheet({
  from,
  productId,
  supplierId,
  link,
  firstLink,
  takenIds = [],
  onClose,
}: {
  /** Desde dónde se abre: fija el producto o el proveedor. */
  from: "product" | "supplier";
  productId?: string;
  supplierId?: string;
  /** Vínculo a editar. Sin él, es un alta. */
  link?: SupplierLink | null;
  /** Si es el primer proveedor del producto (arranca como principal). */
  firstLink?: boolean;
  /** Proveedores (desde el producto) ya vinculados, para no repetirlos en la lista. */
  takenIds?: string[];
  onClose: () => void;
}) {
  const seeCosts = useCan("view_costs");
  const { save, remove } = useSupplierLinkActions();
  const editing = Boolean(link);
  const suppliers = useQuery({
    queryKey: ["suppliers-light"],
    queryFn: () => api<{ id: string; name: string }[]>("/api/suppliers?light=1"),
    enabled: from === "product" && !editing,
  });
  const [sid, setSid] = useState(link?.supplierId ?? supplierId ?? "");
  const [product, setProduct] = useState<{ id: string; name: string } | null>(
    link
      ? { id: link.productId, name: link.productName ?? "" }
      : productId
        ? { id: productId, name: "" }
        : null,
  );
  const [code, setCode] = useState(link?.supplierCode ?? "");
  const [cost, setCost] = useState(moneyInput(link?.costCents ?? null));
  const [pack, setPack] = useState(qtyInput(link?.packQty));
  const [primary, setPrimary] = useState(link?.isPrimary ?? Boolean(firstLink));
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costCents = parseMoney(cost);
  const packQty = parseQty(pack);
  const costBad = cost.trim() !== "" && (costCents === null || costCents < 0);
  const packBad = packQty === undefined;
  const pid = product?.id ?? "";
  const ready = Boolean(sid && pid) && !costBad && !packBad;

  const submit = () => {
    setError(null);
    if (!ready) return;
    const body: SupplierLinkBody = {
      productId: pid,
      supplierCode: code.trim() || null,
      packQty: packQty ?? null,
      isPrimary: primary,
    };
    if (seeCosts) body.costCents = costCents;
    save.mutate(
      { supplierId: sid, body },
      {
        onSuccess: () => {
          toast({ text: editing ? "Cambios guardados" : "Proveedor vinculado" });
          onClose();
        },
        onError: (e) => setError(errorText(e, "No se pudo guardar. Revisá la conexión.")),
      },
    );
  };
  const doRemove = () => {
    if (!link) return;
    remove.mutate(
      { supplierId: link.supplierId, productId: link.productId },
      {
        onSuccess: () => {
          toast({ text: "Vínculo quitado" });
          onClose();
        },
        onError: (e) => {
          setConfirmRemove(false);
          setError(errorText(e, "No se pudo quitar. Revisá la conexión."));
        },
      },
    );
  };

  const options = (suppliers.data ?? []).filter((s) => !takenIds.includes(s.id));
  const title = editing
    ? from === "product"
      ? `Proveedor · ${link?.supplierName ?? ""}`
      : `Producto · ${link?.productName ?? ""}`
    : from === "product"
      ? "Agregar proveedor"
      : "Agregar producto";
  const busy = save.isPending || remove.isPending;

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        confirmRemove ? (
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmRemove(false)}>
              No
            </Button>
            <Button variant="danger" className="flex-1" disabled={busy} onClick={doRemove}>
              Sí, quitar
            </Button>
          </>
        ) : (
          <>
            {editing && (
              <Button variant="secondary" disabled={busy} onClick={() => setConfirmRemove(true)}>
                Quitar
              </Button>
            )}
            <Button className="flex-1" disabled={!ready || busy} onClick={submit}>
              Guardar
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {from === "product" && !editing && (
          <SelectField
            label="Proveedor"
            value={sid}
            onChange={(e) => setSid(e.target.value)}
            disabled={suppliers.isPending}
            error={suppliers.isError ? "No pudimos traer los proveedores." : null}
            hint={
              suppliers.data && !options.length
                ? "No hay más proveedores para agregar. Cargalos en Compras › Proveedores."
                : undefined
            }
          >
            <option value="">{suppliers.isPending ? "Cargando…" : "Elegí"}</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        )}
        {from === "supplier" && !editing && (
          <ProductSearch
            value={product}
            onPick={(p) => {
              setProduct(p);
              // Sin proveedor todavía: este pasa a ser el principal.
              if (p) setPrimary(!p.supplierName);
              if (p && seeCosts && !cost && p.costCents != null) setCost(moneyInput(p.costCents));
            }}
          />
        )}
        <TextField
          label="Código del proveedor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="YPL-1K"
          maxLength={40}
          hint="Opcional. Sale en los pedidos."
        />
        {seeCosts && (
          <TextField
            label="Costo del proveedor"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="4850"
            error={costBad ? "Poné un costo válido, por ejemplo 4850." : null}
            hint={costCents != null ? formatMoney(costCents) : "Opcional. Por unidad de venta."}
          />
        )}
        <TextField
          label="Unidades por bulto"
          inputMode="decimal"
          value={pack}
          onChange={(e) => setPack(e.target.value)}
          placeholder="12"
          error={packBad ? "Poné un número mayor que cero." : null}
          hint="Opcional. Para redondear los pedidos."
        />
        <Toggle
          label="Proveedor principal"
          hint="El pedido sugerido usa el principal. Los demás quedan como alternativos."
          checked={primary}
          onChange={setPrimary}
        />
        {confirmRemove && (
          <div
            role="alert"
            className="rounded-lg bg-alerta-suave px-3 py-2 text-[13px] font-semibold text-alerta"
          >
            ¿Quitás el vínculo? El producto deja de salir en los pedidos de este proveedor.
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-peligro-suave px-3 py-2 text-[13px] font-semibold text-peligro"
          >
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}
