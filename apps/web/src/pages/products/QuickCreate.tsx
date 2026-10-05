import { formatMoney, parseMoney } from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useMe } from "../../app/session";
import { offSuggestion, quickCreateProduct } from "../../data/catalog";
import { localDb } from "../../data/db";
import type { LocalProduct } from "../../data/types";
import { Button } from "../../ui/Button";
import { SelectField, TextField } from "../../ui/Field";

const LAST_CATEGORY = "mostrador.lastCategory";

/**
 * Alta rápida desde un código desconocido: nombre, precio y categoría; stock inicial opcional.
 * Diez segundos y sigue la venta. Si el código está en Open Food Facts, el nombre se completa solo.
 */
export function QuickCreateForm({
  code,
  onCreated,
  onCancel,
  submitLabel = "Guardar",
  withStock = true,
}: {
  code: string | null;
  onCreated: (p: LocalProduct) => void;
  onCancel?: () => void;
  submitLabel?: string;
  withStock?: boolean;
}) {
  const me = useMe();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [categoryId, setCategoryId] = useState(() => {
    try {
      return localStorage.getItem(LAST_CATEGORY) ?? "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cats = useQuery({
    queryKey: ["local-categories"],
    queryFn: () => localDb().categories.toArray(),
  });
  const off = useQuery({
    queryKey: ["off", code],
    queryFn: () => (code ? offSuggestion(code) : null),
    enabled: Boolean(code),
    staleTime: Infinity,
  });

  // Cada código nuevo arranca el formulario de cero.
  // biome-ignore lint/correctness/useExhaustiveDependencies: se reinicia al cambiar el código
  useEffect(() => {
    setName("");
    setPrice("");
    setStock("");
    setError(null);
    nameRef.current?.focus();
  }, [code]);
  useEffect(() => {
    if (off.data?.found && off.data.name) setName((n) => n || (off.data?.name ?? ""));
  }, [off.data]);

  const priceCents = parseMoney(price);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Poné el nombre.");
    if (priceCents === null || priceCents <= 0)
      return setError("Poné el precio, por ejemplo 1500.");
    if (!me) return;
    setBusy(true);
    try {
      try {
        localStorage.setItem(LAST_CATEGORY, categoryId);
      } catch {}
      const n = stock.trim() ? Number(stock.replace(",", ".")) : null;
      const p = await quickCreateProduct(me.member.id, {
        name,
        priceCents,
        categoryId: categoryId || null,
        code,
        initialStock: n && n > 0 ? n : null,
      });
      onCreated(p);
    } finally {
      setBusy(false);
    }
  };

  const parents = (cats.data ?? []).filter((c) => !c.parentId);
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {code && (
        <div className="flex items-center justify-between rounded-lg bg-fondo px-3 py-2 text-sm">
          <span className="text-texto-suave">Código</span>
          <span className="tnum font-semibold">{code}</span>
        </div>
      )}
      <TextField
        ref={nameRef}
        label="Nombre"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Galletitas de agua 200 g"
        hint={
          off.isFetching
            ? "Buscando el nombre en Open Food Facts…"
            : off.data?.found
              ? "Nombre sugerido por Open Food Facts"
              : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Precio"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="1500"
          hint={priceCents ? formatMoney(priceCents) : undefined}
        />
        {withStock ? (
          <TextField
            label="Stock inicial"
            inputMode="decimal"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            placeholder="Opcional"
          />
        ) : (
          <span />
        )}
      </div>
      <SelectField
        label="Categoría"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
      >
        <option value="">Sin categoría</option>
        {parents.flatMap((c) => [
          <option key={c.id} value={c.id}>
            {String(c.name)}
          </option>,
          ...(cats.data ?? [])
            .filter((ch) => ch.parentId === c.id)
            .map((ch) => (
              <option key={ch.id} value={ch.id}>
                {String(c.name)} › {String(ch.name)}
              </option>
            )),
        ])}
      </SelectField>
      {error && (
        <div role="alert" className="text-[13px] font-semibold text-peligro">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={busy} className="flex-1" size="lg">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
