import type { Tender } from "@mostrador/shared";
import {
  canComplete,
  checkoutState,
  formatMoney,
  METHOD_LABEL,
  makeTender,
  type PaymentMethodCode,
  plural,
} from "@mostrador/shared";
import { Banknote, CreditCard, HandCoins, QrCode, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGrant } from "../../app/session";
import { useSettings } from "../../data/settings";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Key } from "../../ui/Key";
import { NumPad } from "../../ui/NumPad";
import { toast } from "../../ui/toast";

type Tab = "cash" | "card" | "transfer" | "account";

const TABS: { id: Tab; label: string; icon: typeof Banknote; key: string }[] = [
  { id: "cash", label: "Efectivo", icon: Banknote, key: "E" },
  { id: "card", label: "Tarjeta", icon: CreditCard, key: "T" },
  { id: "transfer", label: "Transferencia o QR", icon: QrCode, key: "Q" },
  { id: "account", label: "Fiado", icon: HandCoins, key: "F" },
];

const BILLS = [100_000, 200_000, 1_000_000, 2_000_000];

export type TicketOutput = "print" | "share" | "none";

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
  initialTab,
  onPickCustomer,
}: {
  saleLabel: string;
  itemCount: number;
  totalCents: number;
  /** Cliente asignado (F5): habilita Fiado. */
  fiado: FiadoInfo | null;
  onConfirm: (payments: Tender[], surchargeCents: number, output: TicketOutput) => void;
  onClose: () => void;
  busy?: boolean;
  /** Pestaña con la que abre (al volver de elegir cliente: Fiado). */
  initialTab?: Tab;
  /** F5 adentro del cobro: elegir el cliente sin cerrar la venta. */
  onPickCustomer?: () => void;
}) {
  const settings = useSettings();
  const methods = settings.payments.methods;
  const creditGrant = useGrant("credit_over_limit");
  const [payments, setPayments] = useState<Tender[]>([]);
  const [tab, setTab] = useState<Tab>(initialTab ?? "cash");
  const [card, setCard] = useState<"debit" | "credit">("debit");
  const [transfer, setTransfer] = useState<"transfer" | "qr">("qr");
  const [verified, setVerified] = useState(false);
  const [typed, setTyped] = useState<string | null>(null);
  const [output, setOutput] = useState<TicketOutput>(settings.tickets.printer ? "print" : "none");
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
  // "Falta" es lo que queda después de los pagos ya agregados; con algo tipeado, descuenta eso.
  // Sin pagos y sin tipear no se muestra: el medio elegido cubre justo el total.
  const stillDue = typed !== null ? Math.max(0, remaining - current) : remaining;
  const showDue = payments.length > 0 || (typed !== null && stillDue > 0);
  // Lo que se muestra en grande: en efectivo, lo recibido; con otro medio, lo que se cobra
  // (con el recargo incluido: es el número que va al posnet).
  const shown = tab === "cash" ? current : (pending?.amountCents ?? 0);
  const projectedChange =
    tab === "cash" && pending ? Math.max(0, pending.amountCents - remaining) : changeCents;

  const blocked =
    tab === "transfer" && !verified
      ? 'Para confirmar, tildá "Verificada en el banco" (tecla V).'
      : tab === "account" && !fiado
        ? "Elegí el cliente para fiar (F5)."
        : null;
  /** "crédito", "débito", pero "QR o billetera" (la sigla no se baja). */
  const lower = (label: string) => (/^[A-Z]{2}/.test(label) ? label : label.toLowerCase());

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
    onConfirm(list, checkoutState(totalCents, list).surchargeCents, output);
  }, [busy, payments, remaining, blocked, pending, totalCents, onConfirm, output]);

  const pickTab = useCallback(
    (t: Tab) => {
      if (t === "account" && !methods.account.enabled) return;
      setTab(t);
      setTyped(null);
    },
    [methods.account.enabled],
  );

  // Teclado: dígitos al monto; E, T, Q y F eligen el medio; V tilda "Verificada"; F5 elige
  // cliente; Enter agrega el pago o confirma; Ctrl+Enter y F12 confirman; Esc vuelve a la venta.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (k === "F5") {
        e.preventDefault();
        onPickCustomer?.();
        return;
      }
      // Ctrl+1 a Ctrl+4: los billetes de efectivo rápido ($ 1.000, $ 2.000, $ 10.000, $ 20.000).
      if ((e.ctrlKey || e.metaKey) && /^[1-4]$/.test(k) && tab === "cash") {
        e.preventDefault();
        const b = BILLS[Number(k) - 1] ?? 0;
        setTyped((t) => String((Number(t ?? "0") || 0) + b / 100));
        return;
      }
      const letter = k.length === 1 ? k.toUpperCase() : "";
      const t = TABS.find((x) => x.key === letter);
      if (t && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        pickTab(t.id);
        return;
      }
      // D y C: tarjeta de débito o de crédito, sin tabular hasta el botón (ronda 3).
      if ((letter === "D" || letter === "C") && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        pickTab("card");
        setCard(letter === "D" ? "debit" : "credit");
        box.current?.focus();
        return;
      }
      if (letter === "V" && tab === "transfer") {
        e.preventDefault();
        setVerified((v) => !v);
        return;
      }
      if (k === "Enter" || k === "F12") {
        // Enter sobre un botón o una casilla enfocados los activa (eso es lo que uno espera al
        // llegar con Tab hasta "Tarjeta"): no confirma el cobro.
        const el = document.activeElement;
        if (
          k === "Enter" &&
          !e.ctrlKey &&
          !e.metaKey &&
          el instanceof HTMLElement &&
          el !== box.current &&
          box.current?.contains(el) &&
          (el.tagName === "BUTTON" || el.tagName === "INPUT" || el.tagName === "LABEL")
        ) {
          return;
        }
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [confirm, onClose, onPickCustomer, pickTab, tab]);

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
        data-keypad
        className="outline-none grid max-h-[96vh] w-full overflow-y-auto rounded-t-2xl bg-superficie shadow-xl lg:max-w-[960px] lg:grid-cols-[400px_1fr] lg:rounded-card"
      >
        <div className="flex flex-col gap-4 border-borde bg-fondo p-5 lg:border-r lg:p-7">
          <div className="flex items-center justify-between text-[13px] text-texto-suave">
            <span>
              {saleLabel} · {plural(itemCount, "ítem", "ítems")}
            </span>
            <button
              type="button"
              aria-label="Volver a la venta"
              onClick={onClose}
              className="inline-flex size-12 items-center justify-center rounded-lg lg:hidden"
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
              Incluye recargo {lower(METHOD_LABEL[method])}{" "}
              {formatMoney(surcharge + (remaining > 0 ? extra : 0))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {/* Sin pagos cargados, el rótulo solo no dice nada (ronda 3: "PAGOS" vacío). */}
            {summary.length > 0 && (
              <div className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
                Pagos
              </div>
            )}
            {summary.map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between rounded-lg border border-borde bg-superficie px-3 py-2.5"
              >
                <span>{METHOD_LABEL[p.method]}</span>
                <span className="tnum font-semibold">{formatMoney(p.amountCents)}</span>
              </div>
            ))}
            {!showDue ? null : stillDue > 0 ? (
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
            <fieldset className="m-0 flex gap-2 border-0 p-0" aria-label="Ticket">
              {(
                [
                  ["print", "Imprimir"],
                  ["share", "Compartir"],
                  ["none", "Sin ticket"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={output === id}
                  onClick={() => setOutput(id)}
                  className={cx(
                    "h-11 flex-1 rounded-lg border text-[13px] font-semibold lg:h-9",
                    output === id
                      ? "border-primario bg-primario-suave text-primario"
                      : "border-borde bg-superficie",
                  )}
                >
                  {label}
                </button>
              ))}
            </fieldset>
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5 lg:p-7">
          {/* Título arriba y la ayuda debajo: en la misma línea se encimaban (ronda 3). */}
          <div className="hidden flex-col gap-0.5 lg:flex">
            <span className="text-xl font-semibold">Cobrar</span>
            <span className="text-[13px] text-texto-suave">Enter cobra · Esc vuelve</span>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                aria-keyshortcuts={t.key}
                disabled={t.id === "account" && !methods.account.enabled}
                title={
                  t.id === "account" && !methods.account.enabled
                    ? "El fiado está apagado en Ajustes › Medios de pago"
                    : undefined
                }
                onClick={() => pickTab(t.id)}
                className={cx(
                  "flex h-14 items-center justify-center gap-2 rounded-lg text-sm font-semibold lg:h-[60px]",
                  tab === t.id
                    ? "border-2 border-primario bg-primario-suave"
                    : "border border-borde bg-superficie",
                )}
              >
                <t.icon size={20} aria-hidden />
                {t.label}
                <Key>{t.key}</Key>
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
                  onClick={() => {
                    setCard(c);
                    // El foco vuelve al cobro: el Enter siguiente cobra.
                    box.current?.focus();
                  }}
                  className={cx(
                    "h-12 rounded-full px-3 text-xs font-semibold lg:h-8",
                    card === c ? "bg-texto text-fondo" : "border border-borde bg-superficie",
                  )}
                >
                  {METHOD_LABEL[c]}
                  {methods[c].surchargeBp ? ` +${methods[c].surchargeBp / 100} %` : ""}
                  <span className="ml-1 hidden opacity-70 lg:inline">
                    ({c === "debit" ? "D" : "C"})
                  </span>
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
                      "h-12 rounded-full px-3 text-xs font-semibold lg:h-8",
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
                  {settings.payments.alias && (
                    <button
                      type="button"
                      className="h-11 self-start rounded-lg border border-borde px-3 text-[13px] font-semibold lg:h-9"
                      onClick={() =>
                        navigator.clipboard
                          ?.writeText(settings.payments.alias)
                          .then(() => toast({ text: "Alias copiado" }))
                          .catch(() => toast({ text: "No se pudo copiar", tone: "error" }))
                      }
                    >
                      Copiar alias
                    </button>
                  )}
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
                <span className="flex-1">
                  Verificada en el banco
                  <span className="block text-[13px] text-texto-suave">
                    No entregues contra una captura.
                  </span>
                </span>
                <Key>V</Key>
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
                      {fiado.overdue ? "Tiene deuda vencida" : "Se pasa del límite"}
                      {creditGrant === "allow" ? ": lo autorizás vos." : ": pide PIN."}
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Para fiar hace falta un cliente.</span>
                  <Button variant="secondary" onClick={() => onPickCustomer?.()}>
                    Elegir cliente
                    <Key>F5</Key>
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_240px]">
            <div className="flex flex-col gap-2.5">
              <div className="flex min-h-[72px] flex-col justify-center rounded-lg border border-borde bg-fondo px-3.5 py-2.5">
                <div className="text-xs text-texto-suave">
                  {tab === "cash"
                    ? typed === null
                      ? "Recibido en efectivo · justo"
                      : "Recibido en efectivo"
                    : `Cobrá con ${lower(METHOD_LABEL[method])}${extra > 0 ? ` · incluye recargo ${formatMoney(extra)}` : ""}`}
                </div>
                <output
                  className="block tnum text-[32px] font-semibold tracking-[-.02em]"
                  aria-label="Monto"
                >
                  {formatMoney(shown)}
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
                  {/* Ctrl+1 a Ctrl+4 siguen andando; la lista de atajos (F1) los explica. */}
                  {BILLS.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setTyped((t) => String((Number(t ?? "0") || 0) + b / 100))}
                      className="flex h-14 items-center justify-center gap-2 rounded-lg border border-borde bg-superficie text-[15px] font-semibold hover:bg-neutro-suave"
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
                  className="tnum text-[40px] leading-none font-semibold tracking-[-.02em]"
                  aria-label="Vuelto"
                >
                  {formatMoney(projectedChange)}
                </output>
              </div>
            </div>
          </div>
          <div className="sticky -mx-5 -mb-5 bottom-0 bg-superficie px-5 pt-2 pb-5 lg:-mx-7 lg:-mb-7 lg:px-7 lg:pb-7">
            {blocked && remaining > 0 && (
              <div role="alert" className="mb-2 text-[13px] font-semibold text-alerta">
                {blocked}
              </div>
            )}
            <Button
              // "Agregar pago" y "Confirmar cobro" son dos botones distintos: el freno al doble
              // clic de cada uno no se come el clic del otro.
              key={remaining > 0 && current < remaining ? "add" : "confirm"}
              size="xl"
              onClick={confirm}
              disabled={busy || (remaining > 0 && Boolean(blocked))}
              className="h-16 w-full text-xl"
            >
              {remaining > 0 && current < remaining ? "Agregar pago" : "Confirmar cobro"}
              <kbd
                aria-hidden
                className="hidden rounded bg-white/20 px-1.5 py-0.5 text-xs lg:inline"
              >
                Ctrl ⏎
              </kbd>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
