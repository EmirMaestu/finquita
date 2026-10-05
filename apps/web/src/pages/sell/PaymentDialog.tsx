import type { Tender } from "@mostrador/shared";
import {
  canComplete,
  checkoutState,
  formatMoney,
  METHOD_LABEL,
  makeTender,
  type PaymentMethodCode,
} from "@mostrador/shared";
import { Banknote, CreditCard, HandCoins, QrCode, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../../data/settings";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { NumPad } from "../../ui/NumPad";

type Tab = "cash" | "card" | "transfer" | "account";

const TABS: { id: Tab; label: string; icon: typeof Banknote }[] = [
  { id: "cash", label: "Efectivo", icon: Banknote },
  { id: "card", label: "Tarjeta", icon: CreditCard },
  { id: "transfer", label: "Transferencia o QR", icon: QrCode },
  { id: "account", label: "Fiado", icon: HandCoins },
];

const BILLS = [100_000, 200_000, 1_000_000, 2_000_000];

export type FiadoInfo = {
  customerName: string;
  balanceCents: number;
  limitCents: number;
  overdue: boolean;
};

/**
 * Cobro (F12): total grande, cuatro medios, pago combinado y vuelto en grande.
 * Recargos por medio (crédito +10 %) se muestran como línea antes de confirmar.
 */
export function PaymentDialog({
  saleLabel,
  itemCount,
  totalCents,
  fiado,
  onConfirm,
  onClose,
  busy,
}: {
  saleLabel: string;
  itemCount: number;
  totalCents: number;
  /** Cliente asignado (F5): habilita Fiado. */
  fiado: FiadoInfo | null;
  onConfirm: (payments: Tender[], surchargeCents: number) => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const settings = useSettings();
  const methods = settings.payments.methods;
  const [payments, setPayments] = useState<Tender[]>([]);
  const [tab, setTab] = useState<Tab>("cash");
  const [card, setCard] = useState<"debit" | "credit">("debit");
  const [transfer, setTransfer] = useState<"transfer" | "qr">("qr");
  const [verified, setVerified] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // El foco pasa a la ventana: lo que se tipea va al monto, no al buscador de atrás.
  useEffect(() => {
    box.current?.focus();
  }, []);

  const typedCents = typed !== null ? Number(typed || "0") * 100 : null;
  const state = checkoutState(totalCents, payments);
  const { remainingCents: remaining, changeCents } = state;
  const surcharge = state.surchargeCents;
  const due = state.dueCents;
  const method: PaymentMethodCode =
    tab === "card" ? card : tab === "transfer" ? transfer : tab === "account" ? "account" : "cash";
  const bp = methods[method]?.surchargeBp ?? 0;
  const pending = makeTender({
    method,
    remainingCents: remaining,
    typedCents,
    surchargeBp: bp,
    verified,
  });
  const base = typedCents ?? remaining;
  const extra = pending?.surchargeCents ?? 0;
  /** Lo que todavía falta, contando lo que se está tipeando en el medio elegido. */
  const current = pending ? pending.amountCents - extra : 0;
  // Con algo tipeado, "Falta" descuenta ese monto; sin tipear, muestra lo que falta.
  const stillDue = typed !== null ? Math.max(0, remaining - current) : remaining;
  const projectedChange =
    tab === "cash" && pending ? Math.max(0, pending.amountCents - remaining) : changeCents;

  const blocked =
    tab === "transfer" && !verified
      ? 'Tildá "Verificada en el banco" antes de confirmar.'
      : tab === "account" && !fiado
        ? "Asigná un cliente con F5 para fiar."
        : null;

  const confirm = useCallback(() => {
    if (busy) return;
    let list = payments;
    if (remaining > 0) {
      if (blocked || !pending) return;
      list = [...payments, pending];
      if (!canComplete(totalCents, list)) {
        setPayments(list);
        setTyped(null);
        setVerified(false);
        return;
      }
    }
    onConfirm(list, checkoutState(totalCents, list).surchargeCents);
  }, [busy, payments, remaining, blocked, pending, totalCents, onConfirm]);

  // Teclado: dígitos al monto, Enter o Ctrl+Enter confirma, Esc vuelve a la venta.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" || e.key === "F12") {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [confirm, onClose]);

  const onKey = useCallback((k: string) => {
    setTyped((t) => {
      const cur = t ?? "";
      if (k === "back") return cur.slice(0, -1);
      if (k === ",") return cur;
      return (cur + k).replace(/^0+/, "").slice(0, 9);
    });
  }, []);

  const summary = useMemo(
    () => payments.map((p, i) => ({ ...p, key: `${i}-${p.method}` })),
    [payments],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(31,27,22,.45)] lg:items-center">
      <div
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Cobrar"
        className="outline-none grid max-h-[96vh] w-full overflow-y-auto rounded-t-2xl bg-superficie shadow-xl lg:max-w-[960px] lg:grid-cols-[400px_1fr] lg:rounded-card"
      >
        <div className="flex flex-col gap-4 border-borde bg-fondo p-5 lg:border-r lg:p-7">
          <div className="flex items-center justify-between text-[13px] text-texto-suave">
            <span>
              {saleLabel} · {itemCount} ítems
            </span>
            <button
              type="button"
              aria-label="Volver a la venta"
              onClick={onClose}
              className="inline-flex size-10 items-center justify-center rounded-lg lg:hidden"
            >
              <X size={20} />
            </button>
          </div>
          <output
            className="block tnum text-5xl leading-none font-semibold tracking-[-.02em] lg:text-[56px]"
            aria-label="Total a cobrar"
          >
            {formatMoney(due + (remaining > 0 ? extra : 0))}
          </output>
          {(surcharge > 0 || extra > 0) && (
            <div className="text-[13px] text-texto-suave">
              Incluye recargo {METHOD_LABEL[method].toLowerCase()}{" "}
              {formatMoney(surcharge + (remaining > 0 ? extra : 0))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Pagos
            </div>
            {summary.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between rounded-lg border border-borde bg-superficie px-3 py-2.5"
              >
                <span>{METHOD_LABEL[p.method]}</span>
                <span className="tnum font-semibold">{formatMoney(p.amountCents)}</span>
              </div>
            ))}
            {stillDue > 0 ? (
              <div className="flex justify-between rounded-lg bg-alerta-suave px-3 py-2.5 font-semibold text-alerta">
                <span>Falta</span>
                <span className="tnum">{formatMoney(stillDue)}</span>
              </div>
            ) : (
              <div className="flex justify-between rounded-lg bg-exito-suave px-3 py-2.5 font-semibold text-exito">
                <span>Falta</span>
                <span className="tnum">{formatMoney(0)}</span>
              </div>
            )}
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <div className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Comprobante
            </div>
            <div className="flex gap-2">
              <span className="flex h-10 flex-1 items-center justify-center rounded-lg border-2 border-primario bg-superficie text-[13px] font-semibold">
                Ticket no fiscal
              </span>
              <span className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-deshabilitado bg-fondo text-[13px] font-semibold text-texto-apagado">
                Factura{" "}
                <span className="rounded-full bg-deshabilitado px-1.5 text-[10px]">
                  Próximamente
                </span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5 lg:p-7">
          <div className="hidden items-center justify-between lg:flex">
            <span className="text-xl font-semibold">Cobrar</span>
            <span className="text-[13px] text-texto-suave">Esc vuelve a la venta</span>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                disabled={t.id === "account" && !methods.account.enabled}
                onClick={() => {
                  setTab(t.id);
                  setTyped(null);
                }}
                className={cx(
                  "flex h-14 items-center justify-center gap-2 rounded-lg text-sm font-semibold lg:h-[60px]",
                  tab === t.id
                    ? "border-2 border-primario bg-primario-suave"
                    : "border border-borde bg-superficie",
                )}
              >
                <t.icon size={20} aria-hidden />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "card" && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-neutro-suave px-3 py-2.5 text-[13px]">
              <span className="font-semibold">Tarjeta:</span>
              {(["debit", "credit"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={card === c}
                  onClick={() => setCard(c)}
                  className={cx(
                    "h-8 rounded-full px-3 text-xs font-semibold",
                    card === c ? "bg-texto text-fondo" : "border border-borde bg-superficie",
                  )}
                >
                  {METHOD_LABEL[c]}
                  {methods[c].surchargeBp ? ` +${methods[c].surchargeBp / 100} %` : ""}
                </button>
              ))}
              <span className="ml-auto text-texto-suave">
                El cobro en el posnet se confirma a mano
              </span>
            </div>
          )}
          {tab === "transfer" && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-2">
                {(["qr", "transfer"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={transfer === c}
                    onClick={() => setTransfer(c)}
                    className={cx(
                      "h-8 rounded-full px-3 text-xs font-semibold",
                      transfer === c ? "bg-texto text-fondo" : "border border-borde bg-superficie",
                    )}
                  >
                    {METHOD_LABEL[c]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3.5 rounded-card border border-borde p-3.5">
                {settings.payments.qrImage ? (
                  <img
                    src={settings.payments.qrImage}
                    alt="QR del local"
                    className="size-28 rounded-lg"
                  />
                ) : (
                  <div className="flex size-28 shrink-0 items-center justify-center rounded-lg border border-borde text-center text-xs text-texto-suave">
                    Cargá el QR en Ajustes
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-1 text-sm">
                  <span className="text-xs text-texto-suave">QR fijo del local</span>
                  <span className="font-semibold">
                    {settings.payments.alias || "Sin alias cargado"}
                  </span>
                  {settings.payments.cvu && (
                    <span className="text-[13px] break-all text-texto-suave">
                      CVU {settings.payments.cvu}
                    </span>
                  )}
                </div>
              </div>
              <label className="flex min-h-12 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                  className="size-6 accent-[var(--primario)]"
                />
                <span>
                  Verificada en el banco
                  <span className="block text-[13px] text-texto-suave">
                    No entregues contra una captura.
                  </span>
                </span>
              </label>
            </div>
          )}
          {tab === "account" && (
            <div className="rounded-lg bg-neutro-suave px-3 py-2.5 text-sm">
              {fiado ? (
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">{fiado.customerName}</span>
                  <span>
                    Saldo {formatMoney(fiado.balanceCents)} · límite {formatMoney(fiado.limitCents)}{" "}
                    · después {formatMoney(fiado.balanceCents + Math.min(base, remaining))}
                  </span>
                  {(fiado.overdue ||
                    fiado.balanceCents + Math.min(base, remaining) > fiado.limitCents) && (
                    <span className="font-semibold text-peligro">
                      {fiado.overdue ? "Tiene deuda vencida" : "Se pasa del límite"}: pide PIN.
                    </span>
                  )}
                </div>
              ) : (
                "Asigná un cliente con F5 para fiar."
              )}
            </div>
          )}

          <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
            <div className="flex flex-col gap-2.5">
              <div className="flex min-h-[72px] flex-col justify-center rounded-lg border border-borde bg-fondo px-3.5 py-2.5">
                <div className="text-xs text-texto-suave">
                  {tab === "cash"
                    ? "Recibido en efectivo"
                    : `Monto con ${METHOD_LABEL[method].toLowerCase()}`}
                </div>
                <output
                  className="block tnum text-[32px] font-semibold tracking-[-.02em]"
                  aria-label="Monto"
                >
                  {formatMoney(current)}
                </output>
              </div>
              <NumPad onKey={onKey} keyboard />
            </div>
            <div className="flex flex-col gap-2">
              {tab === "cash" && (
                <>
                  <div className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
                    Efectivo rápido
                  </div>
                  {BILLS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setTyped(String(b / 100))}
                      className="h-12 rounded-lg border border-borde bg-superficie text-[15px] font-semibold hover:bg-neutro-suave"
                    >
                      {formatMoney(b)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTyped(null)}
                    className="h-12 rounded-lg border border-primario bg-primario-suave text-[15px] font-semibold text-primario"
                  >
                    Justo
                  </button>
                </>
              )}
              <div className="mt-auto flex flex-col gap-0.5 rounded-lg bg-exito-suave p-3 text-exito">
                <span className="text-xs font-semibold">Vuelto</span>
                <output
                  className="tnum text-[32px] leading-none font-semibold tracking-[-.02em]"
                  aria-label="Vuelto"
                >
                  {formatMoney(projectedChange)}
                </output>
              </div>
            </div>
          </div>
          {blocked && remaining > 0 && (
            <div className="text-[13px] font-semibold text-alerta">{blocked}</div>
          )}
          <Button
            size="xl"
            onClick={confirm}
            disabled={busy || (remaining > 0 && Boolean(blocked))}
            className="h-16 text-xl"
          >
            {remaining > 0 && current < remaining ? "Agregar pago" : "Confirmar cobro"}
            <kbd className="rounded bg-white/20 px-1.5 py-0.5 text-xs">Ctrl ⏎</kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}
