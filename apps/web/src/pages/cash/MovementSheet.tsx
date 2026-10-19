import { EXPENSE_CATEGORIES, formatMoney, parseMoney } from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useGrant, useMe } from "../../app/session";
import { requestPin } from "../../auth/pinAuth";
import { addCashMoveLocal, loadShiftView, type ManualMove } from "../../cash/local";
import { api } from "../../data/api";
import type { LocalShift } from "../../data/types";
import { Button } from "../../ui/Button";
import { FilterChip } from "../../ui/Chip";
import { SelectField, TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { toast } from "../../ui/toast";

type Kind = ManualMove["kind"];
const KINDS: { id: Kind; label: string; title: string; hint: string }[] = [
  {
    id: "withdrawal",
    label: "Retiro",
    title: "Retiro de caja",
    hint: "Efectivo que se lleva el dueño o va a la caja fuerte.",
  },
  {
    id: "expense",
    label: "Gasto",
    title: "Gasto de caja",
    hint: "Limpieza, flete, mantenimiento, adelanto de sueldo u otros.",
  },
  { id: "income", label: "Ingreso", title: "Ingreso de caja", hint: "Cambio que trae el dueño." },
  {
    id: "supplier_payment",
    label: "Pago a proveedor",
    title: "Pago a proveedor",
    hint: "Se elige la factura y queda pagada en Compras.",
  },
];

type Invoice = {
  id: string;
  supplierName: string;
  number: string | null;
  pendingCents: number;
  dueOn: string | null;
};

/** Movimientos manuales (F9): todos piden motivo; el cajero necesita PIN. */
export function MovementSheet({
  open,
  onClose,
  shiftId,
  expectedCashCents,
  shift,
  registerName,
  initialKind = "withdrawal",
}: {
  open: boolean;
  onClose: () => void;
  shiftId: string;
  /** Efectivo esperado ya calculado; si falta, se calcula del turno. */
  expectedCashCents?: number;
  shift?: LocalShift;
  registerName: string;
  initialKind?: Kind;
}) {
  const me = useMe();
  const grant = useGrant("cash_movement");
  const [kind, setKind] = useState<Kind>(initialKind);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<keyof typeof EXPENSE_CATEGORIES>("cleaning");
  const [invoiceId, setInvoiceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invoices = useQuery({
    queryKey: ["invoices-pending"],
    queryFn: () => api<Invoice[]>("/api/supplier-invoices/pending"),
    enabled: open && kind === "supplier_payment",
  });
  const k = KINDS.find((x) => x.id === kind) ?? KINDS[0];
  const cents = parseMoney(amount);
  // Desde Vender la hoja no trae el esperado: se calcula del turno (lo que hay en la caja).
  const view = useQuery({
    queryKey: ["shift-view-sheet", shift?.id],
    queryFn: () => (shift ? loadShiftView(shift) : null),
    enabled: open && expectedCashCents === undefined && Boolean(shift),
  });
  const expected = expectedCashCents ?? view.data?.summary.expectedCashCents ?? null;
  const after = expected === null ? null : expected + (kind === "income" ? 1 : -1) * (cents ?? 0);
  const outflow = kind !== "income";

  const submit = async () => {
    if (!me || !k) return;
    setError(null);
    if (cents === null || cents <= 0) return setError("El monto tiene que ser mayor que $ 0.");
    if (outflow && expected !== null && cents > expected)
      return setError(
        `No hay tanto efectivo en ${registerName}: hay ${formatMoney(Math.max(0, expected))}.`,
      );
    if (!reason.trim()) return setError("Contá el motivo: es obligatorio.");
    if (reason.trim().length > 200)
      return setError("El motivo tiene que ser corto: hasta 200 letras.");
    if (kind === "supplier_payment" && !invoiceId) return setError("Elegí la factura que pagás.");
    let auth = null;
    if (grant === "pin") {
      auth = await requestPin(
        "cash_movement",
        `${k.label} de ${formatMoney(cents)} · pedido por ${me.member.name}.`,
      );
      if (!auth) return;
    }
    setBusy(true);
    try {
      await addCashMoveLocal(
        me.member.id,
        {
          shiftId,
          kind,
          amountCents: cents,
          reason: reason.trim(),
          category: kind === "expense" ? category : null,
          invoiceId: invoiceId || null,
        },
        auth,
      );
      toast({ text: `${k.label} registrado: ${formatMoney(cents)}` });
      setAmount("");
      setReason("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={k?.title ?? "Movimiento de caja"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1 lg:flex-none">
            Cancelar
          </Button>
          <div className="hidden flex-1 lg:block" />
          <Button
            onClick={() => void submit()}
            disabled={busy}
            locked={grant === "pin"}
            className="flex-1 lg:flex-none"
          >
            {grant === "pin" ? "Registrar con PIN" : "Registrar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((x) => (
            <FilterChip key={x.id} active={kind === x.id} onClick={() => setKind(x.id)}>
              {x.label}
            </FilterChip>
          ))}
        </div>
        <p className="m-0 text-sm text-texto-suave">{k?.hint}</p>
        {kind === "supplier_payment" && (
          <SelectField
            label="Factura"
            value={invoiceId}
            onChange={(e) => {
              setInvoiceId(e.target.value);
              const inv = invoices.data?.find((i) => i.id === e.target.value);
              if (inv) {
                setAmount(String(inv.pendingCents / 100));
                setReason(`Pago a ${inv.supplierName}`);
              }
            }}
            hint={invoices.isError ? "Sin conexión no se pueden ver las facturas." : undefined}
          >
            <option value="">Elegí la factura</option>
            {(invoices.data ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.supplierName} · {i.number ?? "sin número"} · {formatMoney(i.pendingCents)}
              </option>
            ))}
          </SelectField>
        )}
        <div className="grid grid-cols-2 gap-3">
          {kind === "expense" && (
            <SelectField
              label="Categoría"
              value={category}
              onChange={(e) => setCategory(e.target.value as keyof typeof EXPENSE_CATEGORIES)}
            >
              {Object.entries(EXPENSE_CATEGORIES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            label="Monto"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="4500"
            className={kind === "expense" ? "" : "col-span-2"}
          />
        </div>
        <TextField
          label="Motivo"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={kind === "expense" ? "Lavandina y trapos de piso" : "A la caja fuerte"}
          hint="Obligatorio"
        />
        <div className="flex justify-between rounded-lg bg-fondo px-3 py-2 text-[13px] text-texto-suave">
          <span>
            {kind === "income" ? "Entra al" : "Sale del"} efectivo de {registerName}
            {after !== null ? ` · queda ${formatMoney(after)}` : ""}
          </span>
          <span>Pedido por {me?.member.name}</span>
        </div>
        {error && (
          <div role="alert" className="text-[13px] font-semibold text-peligro">
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}
