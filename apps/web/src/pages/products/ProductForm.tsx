import {
  formatMoney,
  formatPercent,
  marginOnCostBp,
  moneyInput,
  parseMoney,
  priceFromMargin,
} from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useCan } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { fetchCategories, type ProductDetail, type ProductItem } from "../../data/products";
import { Button } from "../../ui/Button";
import { SelectField, TextField, Toggle } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Sin producto: alta. Con producto: edición. */
  product?: ProductItem | ProductDetail | null;
  onSaved?: (p: ProductItem) => void;
  initialCode?: string;
};

/** Alta y edición de producto: nombre, categoría, precio (y costo con permiso), códigos y stock. */
export function ProductForm({ open, onClose, product, onSaved, initialCode }: Props) {
  const qc = useQueryClient();
  const seeCosts = useCan("view_costs");
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories, enabled: open });
  const editing = Boolean(product);
  const [name, setName] = useState(product?.name ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [price, setPrice] = useState(moneyInput(product?.priceCents));
  const [cost, setCost] = useState(moneyInput(product?.costCents ?? null));
  const [codes, setCodes] = useState(
    (product?.barcodes ?? (initialCode ? [initialCode] : [])).join(", "),
  );
  const [plu, setPlu] = useState(product?.internalCode ?? "");
  const [unit, setUnit] = useState<"unit" | "kg">(product?.saleUnit === "kg" ? "kg" : "unit");
  const [minStock, setMinStock] = useState(
    product?.minStock != null ? String(product.minStock).replace(".", ",") : "",
  );
  const [initialStock, setInitialStock] = useState("");
  const [location, setLocation] = useState(product?.location ?? "");
  const [fixedPrice, setFixedPrice] = useState(product?.fixedPrice ?? false);
  const [adult, setAdult] = useState(product?.ageRestricted ?? false);
  const [quick, setQuick] = useState(product?.quickButton ?? false);
  const [error, setError] = useState<string | null>(null);

  const priceCents = parseMoney(price);
  const costCents = parseMoney(cost);
  const margin = costCents && priceCents ? marginOnCostBp(costCents, priceCents) : null;
  const num = (s: string) => (s.trim() ? Number(s.replace(",", ".")) : null);

  const save = useMutation({
    mutationFn: async () => {
      const changes: Record<string, unknown> = {
        name: name.trim(),
        categoryId: categoryId || null,
        priceCents,
        internalCode: plu.trim() || null,
        saleUnit: unit,
        minStock: num(minStock),
        location: location.trim() || null,
        fixedPrice,
        ageRestricted: adult,
        quickButton: quick,
      };
      if (seeCosts) changes.costCents = costCents;
      const barcodes = codes
        .split(/[,\s]+/)
        .map((c) => c.trim())
        .filter(Boolean);
      if (!product) {
        const stock = num(initialStock);
        return api<ProductItem>("/api/products", {
          body: { ...changes, barcodes, ...(stock ? { initialStock: stock } : {}) },
        });
      }
      const updated = await api<ProductItem>(`/api/products/${product.id}`, {
        method: "PATCH",
        body: { changes },
      });
      const added = barcodes.filter((c) => !product.barcodes.includes(c));
      const removed = product.barcodes.filter((c) => !barcodes.includes(c));
      for (const code of added)
        await api(`/api/products/${product.id}/barcodes`, { body: { code } });
      for (const code of removed)
        await api(`/api/products/${product.id}/barcodes/${code}`, { method: "DELETE" });
      return { ...updated, barcodes };
    },
    onSuccess: async (p) => {
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["product", p.id] });
      onSaved?.(p);
      onClose();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "No se pudo guardar. Revisá la conexión."),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Poné el nombre del producto.");
    if (priceCents === null) return setError("Poné un precio válido, por ejemplo 6900.");
    save.mutate();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Editar producto" : "Nuevo producto"}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1 lg:flex-none">
            Cancelar
          </Button>
          <div className="hidden flex-1 lg:block" />
          <Button
            type="submit"
            form="product-form"
            disabled={save.isPending}
            className="flex-1 lg:flex-none"
          >
            Guardar
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={submit} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TextField
          label="Nombre y presentación"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Yerba Playadito 1 kg"
          className="lg:col-span-2"
        />
        <SelectField
          label="Categoría"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          <option value="">Sin categoría</option>
          {(cats.data ?? []).map((c) => (
            <optgroup key={c.id} label={c.name}>
              <option value={c.id}>{c.name}</option>
              {c.children.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {c.name} › {ch.name}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <SelectField
          label="Se vende por"
          value={unit}
          onChange={(e) => setUnit(e.target.value as "unit" | "kg")}
        >
          <option value="unit">Unidad</option>
          <option value="kg">Kilo (pesable)</option>
        </SelectField>
        {seeCosts && (
          <TextField
            label="Costo"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="4850"
            hint={
              costCents
                ? `Con 40 % de ganancia: ${formatMoney(priceFromMargin(costCents, 4000, 5000))}`
                : "Si no lo sabés, dejalo vacío."
            }
          />
        )}
        <TextField
          label={unit === "kg" ? "Precio por kilo" : "Precio de venta"}
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="6900"
          hint={margin !== null ? `Ganancia ${formatPercent(margin)} sobre el costo` : undefined}
          error={
            margin !== null && margin < 0 ? "El precio está debajo del costo: pierde plata." : null
          }
        />
        <TextField
          label="Códigos de barras"
          value={codes}
          onChange={(e) => setCodes(e.target.value)}
          placeholder="7791234000012"
          hint="Si tiene varios, separalos con coma."
        />
        <TextField
          label="Código interno o PLU"
          value={plu}
          onChange={(e) => setPlu(e.target.value)}
          placeholder="1042"
          hint="Para pesables y botones rápidos."
        />
        <TextField
          label="Stock mínimo"
          inputMode="decimal"
          value={minStock}
          onChange={(e) => setMinStock(e.target.value)}
          placeholder="8"
        />
        {!editing && (
          <TextField
            label="Stock inicial"
            inputMode="decimal"
            value={initialStock}
            onChange={(e) => setInitialStock(e.target.value)}
            placeholder="Opcional"
          />
        )}
        <TextField
          label="Ubicación"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Góndola 3"
        />
        <div className="flex flex-col lg:col-span-2">
          <Toggle
            label="Precio fijo"
            hint="Queda afuera del cambio masivo de precios (cigarrillos)."
            checked={fixedPrice}
            onChange={setFixedPrice}
          />
          <Toggle
            label="Mayores de 18"
            hint="Recuerda pedir documento al vender."
            checked={adult}
            onChange={setAdult}
          />
          <Toggle
            label="Botón rápido en Vender"
            hint="Para lo que no tiene código: pan, fiambres, verdura."
            checked={quick}
            onChange={setQuick}
          />
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-peligro-suave px-3 py-2 text-[13px] font-semibold text-peligro lg:col-span-2"
          >
            {error}
          </div>
        )}
      </form>
    </Sheet>
  );
}
