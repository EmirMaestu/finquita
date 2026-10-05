import { formatQty } from "@mostrador/shared";
import { useEffect, useState } from "react";
import { useGrant, useMe } from "../../app/session";
import { localStock } from "../../data/catalog";
import { localDb } from "../../data/db";
import { ADJUST_REASONS, type AdjustReason, adjustStockLocal } from "../../data/stock";
import { Button } from "../../ui/Button";
import { FilterChip } from "../../ui/Chip";
import { SelectField, TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { toast } from "../../ui/toast";

/** Ajuste de stock: cantidad que entra o sale (o el stock real), motivo y nota. */
export function AdjustStockSheet({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const me = useMe();
  const grant = useGrant("adjust_stock");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"unit" | "kg">("unit");
  const [stock, setStock] = useState<number | null>(null);
  const [mode, setMode] = useState<"out" | "in" | "real">("out");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState<AdjustReason>("waste");
  const [note, setNote] = useState("");
  useEffect(() => {
    void (async () => {
      const p = await localDb().products.get(productId);
      if (!p) return;
      setName(p.name);
      setUnit(p.saleUnit === "unit" ? "unit" : "kg");
      setStock(await localStock(p));
    })();
  }, [productId]);
  const n = Number(value.replace(",", "."));
  const valid = value.trim() !== "" && Number.isFinite(n) && (mode === "real" ? n >= 0 : n > 0);
  const delta = mode === "real" ? n - (stock ?? 0) : mode === "in" ? n : -n;
  const submit = async () => {
    if (!me || !valid || stock === null) return;
    await adjustStockLocal({
      memberId: me.member.id,
      productId,
      ...(mode === "real" ? { realQty: n } : { qty: delta }),
      reason,
      note: note.trim() || null,
      needsApproval: grant === "approval",
      currentStock: stock,
    });
    toast({ text: grant === "approval" ? "Ajuste enviado: queda para aprobar" : "Stock ajustado" });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Ajustar stock · ${name}`}
      footer={
        <Button className="flex-1" onClick={() => void submit()} disabled={!valid}>
          {grant === "approval" ? "Enviar para aprobar" : "Ajustar"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-sm text-texto-suave">
          Stock según el sistema:{" "}
          <strong className="text-texto">{stock === null ? "…" : formatQty(stock, unit)}</strong>
        </div>
        <div className="flex gap-2">
          <FilterChip active={mode === "out"} onClick={() => setMode("out")}>
            Sale
          </FilterChip>
          <FilterChip active={mode === "in"} onClick={() => setMode("in")}>
            Entra
          </FilterChip>
          <FilterChip active={mode === "real"} onClick={() => setMode("real")}>
            Stock real
          </FilterChip>
        </div>
        <TextField
          label={mode === "real" ? "Stock real contado" : "Cantidad"}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={unit === "kg" ? "0,500" : "2"}
          hint={
            valid && stock !== null
              ? `Queda en ${formatQty(Math.round((stock + delta) * 1000) / 1000, unit)}`
              : undefined
          }
        />
        <SelectField
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value as AdjustReason)}
        >
          {Object.entries(ADJUST_REASONS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Nota"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Opcional"
        />
        {grant === "approval" && (
          <div className="rounded-lg bg-alerta-suave px-3 py-2 text-[13px] font-semibold text-alerta">
            Lo que cargás queda pendiente hasta que lo apruebe un encargado o el dueño.
          </div>
        )}
      </div>
    </Sheet>
  );
}
