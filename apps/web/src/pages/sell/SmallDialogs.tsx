import { formatMoney, formatTime, parseMoney } from "@mostrador/shared";
import { TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { LocalProduct } from "../../data/types";
import type { HeldSale } from "../../sell/store";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { QuickCreateForm } from "../products/QuickCreate";

/** F3: producto varios a precio libre. */
export function MiscDialog({
  onAdd,
  onClose,
}: {
  onAdd: (amountCents: number, description: string) => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const cents = parseMoney(amount);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (cents && cents > 0) onAdd(cents, desc);
  };
  return (
    <Sheet open onClose={onClose} title="Producto varios">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <TextField
          label="Monto"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1500"
          hint={cents ? formatMoney(cents) : "Para lo que no está cargado."}
        />
        <TextField
          label="Descripción"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Opcional"
        />
        <Button type="submit" size="lg" disabled={!cents}>
          Agregar · Enter
        </Button>
      </form>
    </Sheet>
  );
}

/** Código desconocido: crear producto rápido o vender como varios. */
export function UnknownCodeDialog({
  code,
  onCreated,
  onMisc,
  onClose,
}: {
  code: string;
  onCreated: (p: LocalProduct) => void;
  onMisc: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open onClose={onClose} title={`El código ${code} no está cargado`}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-alerta-suave text-alerta">
            <TriangleAlert size={22} aria-hidden />
          </span>
          <p className="m-0 text-texto-suave">
            Cargalo en diez segundos y seguí la venta. Después completás costo y proveedor.
          </p>
        </div>
        <QuickCreateForm
          code={code}
          submitLabel="Crear y sumar a la venta"
          onCreated={onCreated}
          withStock
        />
        <Button variant="secondary" onClick={onMisc}>
          Vender como varios · F3
        </Button>
      </div>
    </Sheet>
  );
}

/** F6: ventas en espera, con hora y total. */
export function HeldSalesSheet({
  list,
  onTake,
  onHoldCurrent,
  canHold,
  onClose,
}: {
  list: (HeldSale & { totalCents: number })[];
  onTake: (id: string) => void;
  onHoldCurrent: () => void;
  canHold: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open onClose={onClose} title="Ventas en espera">
      <div className="flex flex-col gap-3">
        {canHold && (
          <Button onClick={onHoldCurrent} data-autofocus>
            Poner en espera la venta actual
          </Button>
        )}
        {list.length === 0 && (
          <div className="py-4 text-center text-sm text-texto-suave">No hay ventas esperando.</div>
        )}
        <ul className="m-0 list-none p-0">
          {list.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => onTake(h.id)}
                className="flex min-h-14 w-full items-center gap-3 border-b border-borde text-left"
              >
                <span className="flex-1">
                  <span className="font-semibold">{h.label}</span>
                  <span className="block text-[13px] text-texto-suave">
                    {formatTime(new Date(h.at))}
                  </span>
                </span>
                <span className="tnum font-semibold">{formatMoney(h.totalCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

export const SHORTCUTS: [string, string][] = [
  ["F2", "Buscar producto por nombre"],
  ["F3", "Producto varios, a precio libre"],
  ["F4", "Descuento"],
  ["F5", "Asignar cliente o fiado"],
  ["F6", "Poner en espera o recuperar una venta"],
  ["F9", "Retiro o gasto de caja"],
  ["F10", "Abrir el cajón"],
  ["F12", "Cobrar (también Ctrl + Enter)"],
  ["*", 'Multiplicar: "3 *" y escanear agrega tres'],
  ["+ −", "Sumar o restar uno al ítem elegido"],
  ["Supr", "Quitar el ítem elegido"],
  ["Esc", "Cancelar o cerrar"],
];

/** Franja inferior del mostrador: los principales con su texto corto. */
export const SHORTCUTS_BAR: [string, string][] = [
  ["F2", "Buscar"],
  ["F3", "Varios"],
  ["F4", "Descuento"],
  ["F5", "Cliente"],
  ["F6", "Espera"],
  ["F9", "Retiro"],
  ["F10", "Cajón"],
  ["F12", "Cobrar"],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="Atajos de teclado">
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0">
        {SHORTCUTS.map(([k, v]) => (
          <li key={k} className="flex items-center gap-3">
            <kbd className="min-w-12 rounded border border-borde bg-fondo px-2 py-1 text-center text-xs font-semibold">
              {k}
            </kbd>
            <span>{v}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
