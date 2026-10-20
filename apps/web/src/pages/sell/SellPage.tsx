import {
  addMisc,
  addProduct,
  applyPromotions,
  bumpQty,
  cartTotals,
  creditNeedsPin,
  discountFor,
  formatMoney,
  formatQty,
  METHOD_LABEL,
  moneyInput,
  OpValidationError,
  overDiscountCap,
  parseMoney,
  plural,
  removeLine,
  todayAR,
} from "@mostrador/shared";
import { Lock, Pause, ShieldAlert, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useLockScreen } from "../../app/lock";
import { useCan, useGrant, useMe } from "../../app/session";
import { useViewport } from "../../app/useViewport";
import { requestPin } from "../../auth/pinAuth";
import { OtherShiftNotice } from "../../cash/OtherShiftNotice";
import { useRegister } from "../../cash/useRegister";
import { localStock } from "../../data/catalog";
import { localBalance } from "../../data/customers";
import { localDb } from "../../data/db";
import { useLive } from "../../data/live";
import { useLocalPromotions } from "../../data/promotions";
import { useSettings } from "../../data/settings";
import type { LocalProduct } from "../../data/types";
import { beep } from "../../scan/beep";
import { scanRouter } from "../../scan/GlobalScan";
import { stripScanLeak } from "../../scan/useScanner";
import { completeSale, type Payment } from "../../sell/complete";
import { productIndex } from "../../sell/searchIndex";
import { heldSales, sale, useHeldSales, useSale } from "../../sell/store";
import { printTicket, shareTicket, ticketFromSale } from "../../sell/ticket";
import { syncEngine } from "../../sync";
import { useSyncStatus } from "../../sync/status";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { TextField } from "../../ui/Field";
import { Key } from "../../ui/Key";
import { Menu } from "../../ui/Menu";
import { Sheet } from "../../ui/Sheet";
import { toast } from "../../ui/toast";
import { MovementSheet } from "../cash/MovementSheet";
import { OpenShift } from "../cash/OpenShift";
import { CustomerPicker } from "./CustomerPicker";
import { PaymentDialog, type TicketOutput } from "./PaymentDialog";
import { QuickButtons } from "./QuickButtons";
import { SaleDone } from "./SaleDone";
import { type LineWarning, SaleList, SaleTable } from "./SaleLines";
import { SearchBox } from "./SearchBox";
import {
  HeldSalesSheet,
  MiscDialog,
  SHORTCUTS_BAR,
  ShortcutsHelp,
  UnknownCodeDialog,
} from "./SmallDialogs";
import { WeightDialog } from "./WeightDialog";

type Dialog =
  | { kind: "pay"; tab?: "account" }
  | { kind: "misc" }
  | { kind: "unknown"; code: string }
  | { kind: "held" }
  | { kind: "help" }
  | { kind: "weight"; product: LocalProduct }
  | { kind: "discount" }
  | { kind: "cash" }
  | { kind: "customer"; back?: "pay" }
  | null;

type Done = {
  number: number;
  totalCents: number;
  changeCents: number;
  method: string;
  ticket?: string | null;
};

/** Descuento general (F4): porcentaje o monto; por encima del tope, el cajero necesita PIN. */
function DiscountDialog({
  currentCents,
  subtotalCents,
  capBp,
  onApply,
  onClose,
}: {
  currentCents: number;
  subtotalCents: number;
  capBp: number;
  onApply: (cents: number) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(currentCents ? moneyInput(currentCents) : "");
  const pct = value.trim().endsWith("%");
  const n = pct ? Number(value.replace("%", "").replace(",", ".").trim()) : null;
  const cents = pct
    ? Number.isFinite(n)
      ? discountFor(subtotalCents, { percentBp: Math.round((n ?? 0) * 100) })
      : 0
    : (parseMoney(value) ?? 0);
  // Un descuento va de $ 0 al subtotal: ni negativo (sería un recargo) ni más que la venta.
  const error = !value.trim()
    ? null
    : cents <= 0
      ? "Poné un descuento mayor que $ 0 (por ejemplo, 10% o 500)."
      : cents > subtotalCents
        ? `El descuento no puede superar el subtotal (${formatMoney(subtotalCents)}).`
        : null;
  const valid = Boolean(value.trim()) && !error;
  return (
    <Sheet open onClose={onClose} title="Descuento">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onApply(cents);
        }}
      >
        <TextField
          label="Descuento"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="10% o 500"
          hint={`${formatMoney(Math.max(0, cents))} · tope sin PIN ${capBp / 100} %`}
          error={error}
        />
        <Button type="submit" size="lg" disabled={!valid}>
          Aplicar <Key>Enter</Key>
        </Button>
      </form>
    </Sheet>
  );
}

export function SellPage() {
  const canSell = useCan("sell");
  const discountGrant = useGrant("discount_over_cap");
  const drawerGrant = useGrant("open_drawer");
  const me = useMe();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { layout } = useViewport();
  const desktop = layout === "desktop" || layout === "wide";
  const settings = useSettings();
  const reg = useRegister();
  const { version, online, pendingSales } = useSyncStatus();
  const { cart, selected, multiplier } = useSale();
  const held = useHeldSales();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LocalProduct[]>([]);
  const [active, setActive] = useState(0);
  const [quick, setQuick] = useState<LocalProduct[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [warnings, setWarnings] = useState<LineWarning[]>([]);
  const [adultNotice, setAdultNotice] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [busy, setBusy] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const totals = cartTotals(cart);
  const creditGrant = useGrant("credit_over_limit");
  // Promociones (si están prendidas): se aplican solas y se ven como línea propia.
  const promos = useLocalPromotions(settings.features.promotions);
  const lineKey = cart.lines
    .filter((l) => l.kind !== "promo")
    .map((l) => `${l.id}:${l.qty}:${l.unitPriceCents}`)
    .join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: se recalcula cuando cambian las líneas o las promos
  useEffect(() => {
    const current = sale.get().cart;
    const next = applyPromotions(current, promos, todayAR());
    const sig = (c: typeof current) =>
      c.lines
        .filter((l) => l.kind === "promo")
        .map((l) => `${l.promotionId}:${l.unitPriceCents}`)
        .join("|");
    if (sig(next) !== sig(current)) sale.setCart(next, sale.get().selected);
  }, [lineKey, promos]);
  const customer = useLive(
    async () => {
      if (!cart.customerId) return null;
      const c = await localDb().customers.get(cart.customerId);
      return c ? { ...c, balance: await localBalance(c) } : null;
    },
    [cart.customerId, version],
    null,
  );

  useEffect(() => {
    void productIndex(version).then((idx) => setQuick(idx.quickButtons()));
  }, [version]);

  useEffect(() => {
    let cancelled = false;
    void productIndex(version).then((idx) => {
      if (!cancelled) {
        setResults(query.trim() ? idx.search(query) : []);
        setActive(0);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, version]);

  const focusSearch = useCallback(() => search.current?.focus(), []);

  /** Suma un producto a la venta (con el multiplicador "3 *" si lo hay). */
  const addToSale = useCallback(
    async (p: LocalProduct, qty?: number) => {
      if (p.saleUnit !== "unit" && qty === undefined) {
        // El teclado de peso se abre con la cámara cerrada: si no, queda tapado por el visor.
        scanRouter.closeCamera();
        setDialog({ kind: "weight", product: p });
        return;
      }
      const q = qty ?? sale.get().multiplier ?? 1;
      const r = addProduct(sale.get().cart, p, q);
      sale.setCart(r.cart, r.lineId);
      sale.set({ multiplier: null });
      setQuery("");
      if (scanRouter.isCameraOpen()) {
        // Con la cámara abierta no se ve la lista: se avisa cada lectura.
        const line = r.cart.lines.find((l) => l.id === r.lineId);
        const n = line?.qty ?? q;
        toast({
          text: `Agregado: ${p.name}${n > 1 ? ` × ${formatQty(n, line?.unit ?? "unit")}` : ""}`,
          ms: 1800,
        });
      }
      // Un producto recién creado desde el mostrador (sin stock cargado) no pregunta por stock.
      if (p.kind !== "service" && !p.needsReview) {
        const stock = await localStock(p);
        if (stock - q < 0) {
          if (scanRouter.isCameraOpen())
            toast({
              text: `${p.name}: sin stock según el sistema, se vende igual`,
              tone: "error",
              ms: 3000,
            });
          setWarnings((w) => [
            ...w.filter((x) => x.lineId !== r.lineId),
            {
              lineId: r.lineId,
              text: `Sin stock suficiente según el sistema: hay ${formatQty(stock, p.saleUnit === "unit" ? "unit" : "kg")} y llevás ${formatQty(q, p.saleUnit === "unit" ? "unit" : "kg")}. ¿Vender igual? Queda en ${formatQty(Math.round((stock - q) * 1000) / 1000, p.saleUnit === "unit" ? "unit" : "kg")} y se avisa.`,
            },
          ]);
        }
      }
      if (p.ageRestricted) {
        setAdultNotice(`${p.name} es para mayores de 18. Pedí documento si hace falta.`);
        if (scanRouter.isCameraOpen())
          toast({
            text: `${p.name} es para mayores de 18: pedí documento`,
            tone: "info",
            ms: 3000,
          });
      }
      focusSearch();
    },
    [focusSearch],
  );
  // Dentro del visor se ve lo que va: "3 ítems · $ 18.550".
  useEffect(() => {
    scanRouter.setStatus(
      totals.itemCount
        ? `${plural(totals.itemCount, "ítem", "ítems")} · ${formatMoney(totals.totalCents)}`
        : "Todavía no hay nada en la venta",
    );
    return () => scanRouter.setStatus(null);
  }, [totals.itemCount, totals.totalCents]);

  const dialogRef = useRef<Dialog>(null);
  dialogRef.current = dialog;
  const onCode = useCallback(
    async (code: string) => {
      // Con el cobro u otra ventana abierta, un escaneo no hace nada.
      if (dialogRef.current) {
        beep("error");
        return;
      }
      // Un escaneo con el cartel de "Venta lista" arranca la próxima venta.
      setDone(null);
      setQuery((q) => stripScanLeak(q, code));
      const idx = await productIndex(version);
      const p = idx.search(code, 1)[0];
      const exact =
        p &&
        (p.internalCode === code ||
          (await localDb().barcodes.where("code").equals(code).first())?.productId === p.id);
      if (p && exact) {
        beep("ok");
        await addToSale(p);
        return;
      }
      const { findByCode } = await import("../../data/catalog");
      const found = await findByCode(code);
      if (found) {
        beep("ok");
        await addToSale(found);
        return;
      }
      beep("error");
      // El diálogo de código desconocido necesita la pantalla: la cámara se cierra.
      scanRouter.closeCamera();
      setDialog({ kind: "unknown", code });
    },
    [addToSale, version],
  );

  // La venta toma los escaneos (pistola y cámara).
  useEffect(() => scanRouter.claim((c) => void onCode(c)), [onCode]);

  // Desde la ficha rápida: "Vender".
  useEffect(() => {
    const id = params.get("agregar");
    if (!id) return;
    void localDb()
      .products.get(id)
      .then((p) => p && addToSale(p));
    setParams({}, { replace: true });
  }, [params, setParams, addToSale]);

  const openPay = useCallback(() => {
    if (!sale.get().cart.lines.length) return;
    setDialog({ kind: "pay" });
  }, []);

  const finish = useCallback(
    async (payments: Payment[], surchargeCents: number, output: TicketOutput = "none") => {
      if (!me || !reg.shift || !reg.registerId) return;
      // Fiado por encima del límite o con deuda vencida: el cajero necesita PIN.
      let authorizedBy: string | null = null;
      const fiado = payments
        .filter((p) => p.method === "account")
        .reduce((a, p) => a + p.amountCents, 0);
      if (
        fiado &&
        customer &&
        creditNeedsPin({
          balanceCents: customer.balance,
          limitCents: customer.creditLimitCents,
          overdueCents: customer.overdueCents ?? 0,
          chargeCents: fiado,
        })
      ) {
        if (creditGrant === "pin") {
          const a = await requestPin(
            "credit_over_limit",
            `Fiado de ${formatMoney(fiado)} a ${customer.name}: ${customer.overdueCents ? "tiene deuda vencida" : "se pasa del límite"}. Pedido por ${me.member.name}.`,
          );
          if (!a) return;
          authorizedBy = a.memberId;
        } else if (creditGrant === "deny") {
          toast({ text: "No podés fiar por encima del límite", tone: "error" });
          return;
        }
      }
      setBusy(true);
      try {
        const s = await completeSale({
          member: { id: me.member.id, name: me.member.name },
          registerId: reg.registerId,
          shiftId: reg.shift.id,
          cart: sale.get().cart,
          payments,
          surchargeCents,
          authorizedBy,
        });
        setDone({
          number: s.number,
          totalCents: s.totalCents,
          changeCents: s.changeCents,
          method: [...new Set(payments.map((p) => METHOD_LABEL[p.method].toLowerCase()))].join(
            " + ",
          ),
          ticket:
            output === "print"
              ? "Ticket impreso"
              : output === "share"
                ? "Ticket para compartir"
                : null,
        });
        if (output !== "none") {
          const t = ticketFromSale(s, me.business, settings.tickets.footer, customer?.name);
          if (output === "print")
            void printTicket(t, settings.tickets.width, settings.tickets.copies);
          else void shareTicket(t, settings.tickets.width);
        }
        setDialog(null);
        setWarnings([]);
        setAdultNotice(null);
        sale.reset();
      } catch (e) {
        if (e instanceof OpValidationError) {
          toast({ text: `No se cobró: ${e.message}`, tone: "error", ms: 6000 });
          return;
        }
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [me, reg.shift, reg.registerId, customer, creditGrant, settings.tickets],
  );

  const applyDiscount = useCallback(
    async (cents: number) => {
      const sub = cartTotals(sale.get().cart).subtotalCents;
      if (overDiscountCap(sub, cents, settings.pricing.discountCapBp) && discountGrant === "pin") {
        const a = await requestPin(
          "discount_over_cap",
          `Descuento de ${formatMoney(cents)}, sobre el tope del ${settings.pricing.discountCapBp / 100} %. Pedido por ${me?.member.name}.`,
        );
        if (!a) return;
      }
      sale.setCart({ ...sale.get().cart, discountCents: cents });
      setDialog(null);
    },
    [settings.pricing.discountCapBp, discountGrant, me],
  );

  const openDrawer = useCallback(async () => {
    if (drawerGrant === "pin") {
      const a = await requestPin(
        "open_drawer",
        `Abrir el cajón sin venta · pedido por ${me?.member.name}.`,
      );
      if (!a) return;
    }
    toast({ text: "Sin impresora conectada: abrí el cajón a mano.", tone: "info" });
  }, [drawerGrant, me]);

  // Atajos del mostrador. La app captura las teclas F aunque el navegador tenga las suyas.
  const locked = useLockScreen();
  useEffect(() => {
    if (dialog || done || locked) return;
    const h = (e: KeyboardEvent) => {
      const s = sale.get();
      const idx = s.cart.lines.findIndex((l) => l.id === s.selected);
      const searching = query.trim().length > 0;
      const k = e.key;
      const stop = () => {
        e.preventDefault();
        e.stopPropagation();
      };
      if (/^F\d{1,2}$/.test(k)) stop();
      if (k === "F1") return setDialog({ kind: "help" });
      if (k === "F2") return focusSearch();
      if (k === "F3") return setDialog({ kind: "misc" });
      if (k === "F4") return s.cart.lines.length && setDialog({ kind: "discount" });
      if (k === "F5") return setDialog({ kind: "customer" });
      if (k === "F6") return setDialog({ kind: "held" });
      if (k === "F9") return reg.shift && setDialog({ kind: "cash" });
      if (k === "F10") return void openDrawer();
      if (k === "F8") return navigate("/caja");
      if (k === "F12" || (k === "Enter" && (e.ctrlKey || e.metaKey))) {
        stop();
        return openPay();
      }
      if (searching && results.length) {
        if (k === "ArrowDown") {
          stop();
          return setActive((a) => Math.min(results.length - 1, a + 1));
        }
        if (k === "ArrowUp") {
          stop();
          return setActive((a) => Math.max(0, a - 1));
        }
        if (k === "Enter") {
          stop();
          const p = results[active];
          return p && void addToSale(p);
        }
      }
      if (k === "*" && /^\d+$/.test(query.trim())) {
        stop();
        sale.set({ multiplier: Number(query.trim()) });
        return setQuery("");
      }
      // "* 3" con una línea elegida: la deja en 3 unidades (el orden inverso de "3 *").
      if (k === "Enter" && s.selected && /^\*\s*\d+$/.test(query.trim())) {
        stop();
        const n = Number(query.trim().slice(1));
        const line = s.cart.lines.find((l) => l.id === s.selected);
        if (line && n > 0 && n <= 999) {
          let c = s.cart;
          for (let i = 0; i < Math.abs(n - line.qty); i++)
            c = bumpQty(c, s.selected, n > line.qty ? 1 : -1);
          sale.setCart(c, s.selected);
        }
        return setQuery("");
      }
      if (k === "Escape") {
        if (searching) {
          stop();
          return setQuery("");
        }
        if (s.multiplier) return sale.set({ multiplier: null });
      }
      if (searching) return;
      if (k === "Enter" && s.selected && warnings.some((w) => w.lineId === s.selected)) {
        stop();
        return setWarnings((w) => w.filter((x) => x.lineId !== s.selected));
      }
      if (k === "ArrowDown" || k === "ArrowUp") {
        stop();
        const next =
          s.cart.lines[
            Math.max(0, Math.min(s.cart.lines.length - 1, idx + (k === "ArrowDown" ? 1 : -1)))
          ];
        return next && sale.set({ selected: next.id });
      }
      if ((k === "+" || k === "-") && s.selected) {
        stop();
        return sale.setCart(bumpQty(s.cart, s.selected, k === "+" ? 1 : -1));
      }
      if (k === "Delete" && s.selected) {
        stop();
        return sale.setCart(removeLine(s.cart, s.selected), null);
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [
    dialog,
    done,
    query,
    results,
    active,
    warnings,
    addToSale,
    focusSearch,
    openPay,
    openDrawer,
    navigate,
    locked,
    reg.shift,
  ]);

  const promoTotal = -cart.lines
    .filter((l) => l.kind === "promo")
    .reduce((a, l) => a + l.unitPriceCents * l.qty, 0);
  const heldList = useMemo(
    () => held.map((h) => ({ ...h, totalCents: cartTotals(h.cart).totalCents })),
    [held],
  );

  if (!canSell) return <NoPermissionFor perm="sell" />;

  const dialogs = (
    <>
      {dialog?.kind === "pay" && (
        <PaymentDialog
          saleLabel="Venta en curso"
          itemCount={totals.itemCount}
          totalCents={totals.totalCents}
          fiado={
            customer
              ? {
                  customerName: customer.name,
                  balanceCents: customer.balance,
                  limitCents: customer.creditLimitCents,
                  overdue: Boolean(customer.overdueCents),
                }
              : null
          }
          busy={busy}
          initialTab={dialog.tab}
          onPickCustomer={() => setDialog({ kind: "customer", back: "pay" })}
          onConfirm={(p, s, o) => void finish(p, s, o)}
          onClose={() => {
            setDialog(null);
            focusSearch();
          }}
        />
      )}
      {dialog?.kind === "misc" && (
        <MiscDialog
          onClose={() => setDialog(null)}
          onAdd={(cents, desc) => {
            sale.setCart(addMisc(sale.get().cart, { amountCents: cents, description: desc }));
            setDialog(null);
            focusSearch();
          }}
        />
      )}
      {dialog?.kind === "unknown" && (
        <UnknownCodeDialog
          code={dialog.code}
          onClose={() => setDialog(null)}
          onMisc={() => setDialog({ kind: "misc" })}
          onCreated={(p) => {
            setDialog(null);
            void addToSale(p, 1);
          }}
        />
      )}
      {dialog?.kind === "held" && (
        <HeldSalesSheet
          list={heldList}
          canHold={cart.lines.length > 0}
          onClose={() => setDialog(null)}
          onHoldCurrent={() => {
            heldSales.hold(
              cart,
              `${plural(totals.itemCount, "ítem", "ítems")} · ${cart.lines[0]?.description ?? ""}`,
            );
            sale.reset();
            setDialog(null);
            toast({ text: "Venta en espera" });
          }}
          onTake={(id) => {
            const c = heldSales.take(id);
            if (cart.lines.length)
              heldSales.hold(
                cart,
                `${plural(totals.itemCount, "ítem", "ítems")} · ${cart.lines[0]?.description ?? ""}`,
              );
            if (c) sale.setCart(c);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "help" && <ShortcutsHelp onClose={() => setDialog(null)} />}
      {dialog?.kind === "customer" && (
        <CustomerPicker
          current={cart.customerId}
          onClose={() => setDialog(dialog.back ? { kind: "pay", tab: "account" } : null)}
          onClear={() => {
            sale.setCart({ ...sale.get().cart, customerId: null });
            setDialog(dialog.back ? { kind: "pay", tab: "account" } : null);
          }}
          onPick={(c) => {
            sale.setCart({ ...sale.get().cart, customerId: c.id });
            // Desde el cobro (F5 adentro de Fiado) se vuelve al cobro con el cliente puesto.
            setDialog(dialog.back ? { kind: "pay", tab: "account" } : null);
            if (c.overdueCents) toast({ text: `${c.name} tiene deuda vencida`, tone: "error" });
            if (!dialog.back) focusSearch();
          }}
        />
      )}
      {dialog?.kind === "weight" && (
        <WeightDialog
          product={dialog.product}
          onClose={() => setDialog(null)}
          onAdd={(kg) => {
            setDialog(null);
            void addToSale(dialog.product, kg);
          }}
        />
      )}
      {dialog?.kind === "discount" && (
        <DiscountDialog
          currentCents={totals.discountCents}
          subtotalCents={totals.subtotalCents}
          capBp={settings.pricing.discountCapBp}
          onApply={(c) => void applyDiscount(c)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "cash" && reg.shift && (
        <MovementSheet
          open
          onClose={() => setDialog(null)}
          shiftId={reg.shift.id}
          shift={reg.shift}
          registerName={reg.registerName}
        />
      )}
      {done && (
        <SaleDone
          {...done}
          onDone={(key) => {
            setDone(null);
            // "2 *" tipeado sobre la pantalla verde: el 2 arranca la venta nueva, no se pierde.
            if (key && /^[0-9a-zá-úñ]$/i.test(key)) setQuery(key);
            focusSearch();
          }}
        />
      )}
    </>
  );

  if (!reg.ready) {
    return (
      <div className="p-6" role="status" aria-label="Cargando la caja">
        <div className="h-12 animate-pulse rounded-lg bg-neutro-suave" />
      </div>
    );
  }

  // Caja cerrada: un aviso bloquea la venta y ofrece abrirla.
  if (!reg.shift) {
    return (
      <div className="flex min-h-full items-center justify-center p-4">
        {reg.registerId ? (
          <OpenShift registerId={reg.registerId} registerName={reg.registerName} />
        ) : (
          <div className="flex flex-col items-center gap-3 text-center text-texto-suave">
            <span>
              {online
                ? "Bajando la configuración de las cajas…"
                : "Sin internet y todavía no bajó la configuración de las cajas: conectate una vez para poder vender."}
            </span>
            <Button variant="secondary" onClick={() => void syncEngine().kick()}>
              Reintentar
            </Button>
          </div>
        )}
      </div>
    );
  }

  const notices = (
    <>
      <OtherShiftNotice />
      {adultNotice && (
        <div className="flex items-center gap-2.5 rounded-lg bg-alerta-suave px-3.5 py-2.5 text-[13px] font-medium text-alerta">
          <ShieldAlert size={16} aria-hidden />
          <span className="flex-1">{adultNotice}</span>
          <button type="button" className="font-semibold" onClick={() => setAdultNotice(null)}>
            Listo
          </button>
        </div>
      )}
      {!online && (
        <div
          role="status"
          className="rounded-lg bg-alerta-suave px-3.5 py-2.5 text-[13px] font-medium text-alerta"
        >
          Sin internet: podés seguir vendiendo. Las ventas se guardan acá y se sincronizan solas al
          volver{pendingSales ? ` (${pendingSales} por sincronizar)` : ""}.
        </div>
      )}
    </>
  );

  if (!desktop) {
    return (
      <div className="flex min-h-full flex-col pb-24">
        <div className="flex gap-2 border-b border-borde bg-superficie px-4 py-3">
          <SearchBox
            ref={search}
            value={query}
            onChange={setQuery}
            results={results}
            active={active}
            onPick={(p) => void addToSale(p)}
            multiplier={multiplier}
            onCamera={() => scanRouter.openCamera()}
          />
        </div>
        <div className="flex flex-col gap-2 px-4 pt-2 empty:hidden">{notices}</div>
        <SaleList
          lines={cart.lines}
          warnings={warnings}
          onQty={(id, dir) => sale.setCart(bumpQty(cart, id, dir))}
          onRemove={(id) => sale.setCart(removeLine(cart, id), null)}
          onDismissWarning={(id) => setWarnings((w) => w.filter((x) => x.lineId !== id))}
        />
        <div className="px-4 pt-3.5 pb-1.5 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
          Sin código
        </div>
        <QuickButtons row products={quick} onPick={(p) => void addToSale(p)} />
        <div className="flex gap-2 px-4 pt-3">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => setDialog({ kind: "held" })}
            icon={<Pause size={18} />}
          >
            Espera{held.length ? ` · ${held.length}` : ""}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={() => setDialog({ kind: "misc" })}
          >
            Varios
          </Button>
          <Menu
            label="Más"
            className="flex-1"
            items={[
              { label: "Asignar cliente o fiado", onSelect: () => setDialog({ kind: "customer" }) },
              {
                label: "Descuento",
                onSelect: () => cart.lines.length && setDialog({ kind: "discount" }),
              },
              { label: "Historial de ventas", onSelect: () => navigate("/vender/historial") },
              { label: "Ventas en espera", onSelect: () => setDialog({ kind: "held" }) },
            ]}
          />
        </div>
        <div className="fixed inset-x-0 bottom-[76px] z-20 border-t border-borde bg-superficie px-4 py-3">
          <button
            type="button"
            onClick={openPay}
            disabled={!cart.lines.length}
            className="flex h-[60px] w-full items-center justify-between rounded-lg bg-primario px-5 text-lg font-semibold text-sobre-primario disabled:bg-deshabilitado disabled:text-texto-apagado"
          >
            <span className="text-[15px] font-medium">
              {plural(totals.itemCount, "ítem", "ítems")} · {formatMoney(totals.totalCents)}
            </span>
            <span>Cobrar</span>
          </button>
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[65fr_35fr]">
      <div className="flex min-h-0 flex-col border-r border-borde">
        <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
          <SearchBox
            ref={search}
            value={query}
            onChange={setQuery}
            results={results}
            active={active}
            onPick={(p) => void addToSale(p)}
            multiplier={multiplier}
          />
          <Button variant="secondary" size="lg" onClick={() => setDialog({ kind: "misc" })}>
            Varios · F3
          </Button>
        </div>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5">
          <SaleTable
            lines={cart.lines}
            selected={selected}
            onSelect={(id) => sale.set({ selected: id })}
            warnings={warnings}
            onDismissWarning={(id) => setWarnings((w) => w.filter((x) => x.lineId !== id))}
            onQty={(id, dir) => sale.setCart(bumpQty(cart, id, dir))}
            onRemove={(id) => {
              sale.setCart(removeLine(cart, id), null);
              setWarnings((w) => w.filter((x) => x.lineId !== id));
            }}
          />
          {notices}
          {quick.length > 0 && (
            <>
              <div className="pt-1 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
                Sin código · pesables y sueltos
              </div>
              <QuickButtons products={quick} onPick={(p) => void addToSale(p)} />
            </>
          )}
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-borde bg-superficie px-5 py-2.5 text-[13px]">
          {SHORTCUTS_BAR.map(([k, v]) => (
            <span key={k} className="inline-flex h-6 items-center gap-1.5">
              <kbd className="min-w-7 rounded border border-borde bg-fondo px-1.5 py-0.5 text-center text-[11px] font-semibold">
                {k}
              </kbd>
              <span className="text-texto-suave">{v}</span>
            </span>
          ))}
          <span className="flex-1" />
          <span className="text-texto-suave">F1 todos los atajos</span>
        </div>
      </div>
      <aside aria-label="Total" className="flex flex-col gap-3.5 bg-superficie p-5">
        <div className="flex justify-between text-[13px] text-texto-suave">
          <span>Venta en curso</span>
          <span>{plural(totals.itemCount, "ítem", "ítems")}</span>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-texto-suave">Subtotal</span>
            <span className="tnum">{formatMoney(totals.subtotalCents)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-texto-suave">Promociones</span>
            <span className={cx("tnum", promoTotal ? "text-exito" : "text-texto-suave")}>
              {promoTotal ? `−${formatMoney(promoTotal)}` : "Ninguna"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-texto-suave">Descuento</span>
            <span className={cx("tnum", totals.discountCents ? "text-exito" : "text-texto-suave")}>
              {totals.discountCents ? `−${formatMoney(totals.discountCents)}` : "Ninguno"}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-0.5 border-t border-borde pt-3">
          <span className="text-[13px] text-texto-suave">Total</span>
          <output
            className="tnum text-[64px] leading-none font-semibold tracking-[-.02em]"
            aria-label="Total"
          >
            {formatMoney(totals.totalCents)}
          </output>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ kind: "customer" })}
          className={cx(
            "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm font-medium",
            customer
              ? customer.overdueCents
                ? "border-peligro bg-peligro-suave text-peligro"
                : "border-borde text-texto"
              : "border-dashed border-borde text-texto-suave",
          )}
        >
          <User size={20} aria-hidden />
          <span className="flex-1">
            {customer ? (
              <>
                <span className="font-semibold">{customer.name}</span>
                <span className="block text-xs">
                  Saldo {formatMoney(customer.balance)} · límite{" "}
                  {formatMoney(customer.creditLimitCents)}
                  {customer.overdueCents ? ` · vencido ${formatMoney(customer.overdueCents)}` : ""}
                </span>
              </>
            ) : (
              "Asignar cliente o fiado"
            )}
          </span>
          <kbd className="rounded border border-borde px-1.5 py-0.5 text-[11px] font-semibold">
            F5
          </kbd>
        </button>
        <div className="flex-1" />
        <Button onClick={openPay} disabled={!cart.lines.length} className="h-[72px] text-[22px]">
          Cobrar <kbd className="rounded bg-white/20 px-1.5 py-0.5 text-xs">F12</kbd>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="h-11 flex-1 text-[13px]"
            onClick={() => setDialog({ kind: "held" })}
          >
            Espera · F6{held.length ? ` (${held.length})` : ""}
          </Button>
          <Button
            variant="secondary"
            className="h-11 flex-1 text-[13px]"
            onClick={() => cart.lines.length && setDialog({ kind: "discount" })}
          >
            Descuento · F4
          </Button>
          <Button
            variant="secondary"
            className="h-11 flex-1 text-[13px]"
            locked={drawerGrant === "pin"}
            onClick={() => void openDrawer()}
          >
            Cajón
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 text-xs text-texto-suave">
          <button
            type="button"
            className="font-semibold text-primario"
            onClick={() => navigate("/vender/historial")}
          >
            Historial de ventas
          </button>
          <button
            type="button"
            className="-my-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-texto-suave hover:bg-borde/40 hover:text-texto"
            onClick={() => navigate(me?.member.role === "cashier" ? "/caja" : "/inicio")}
          >
            <Lock size={15} aria-hidden />
            Salir del modo mostrador
          </button>
        </div>
      </aside>
      {dialogs}
    </div>
  );
}
