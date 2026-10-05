import {
  closeResult,
  closingLines,
  countTotal,
  formatMoney,
  METHOD_LABEL,
  moneyInput,
  type PaymentMethodCode,
  parseMoney,
  shiftName,
  signedMoney,
} from "@mostrador/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, EyeOff, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan, useMe } from "../../app/session";
import { closeShiftLocal, loadShiftView } from "../../cash/local";
import { useRegister } from "../../cash/useRegister";
import { localDb } from "../../data/db";
import { useSettings } from "../../data/settings";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { TextField } from "../../ui/Field";
import { Skeleton } from "../../ui/States";
import { Stepper } from "../../ui/Stepper";
import { ClosingReceipt } from "./ClosingReceipt";

const OTHER: { method: "debit" | "credit" | "qr" | "transfer"; label: string }[] = [
  { method: "debit", label: "Débito (posnet)" },
  { method: "credit", label: "Crédito (posnet)" },
  { method: "qr", label: "QR y billetera" },
  { method: "transfer", label: "Transferencias" },
];

/** Arqueo ciego y cierre: se cuenta sin ver el esperado, se comparan los otros medios y se cierra. */
export function CloseShiftPage() {
  const can = useCan("shift");
  const me = useMe();
  const navigate = useNavigate();
  const settings = useSettings();
  const reg = useRegister();
  const [step, setStep] = useState<"count" | "result" | "done">("count");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [left, setLeft] = useState<string | null>(null);
  const [lines, setLines] = useState<string[] | null>(null);
  const shift = reg.shift;
  const view = useQuery({
    queryKey: ["shift-close", shift?.id],
    queryFn: () => (shift ? loadShiftView(shift) : null),
    enabled: Boolean(shift),
  });

  if (!can) return <NoPermissionFor perm="shift" />;
  if (step === "done" && lines)
    return <ClosingReceipt lines={lines} onDone={() => navigate("/caja")} />;
  if (!reg.ready) return <Skeleton className="m-6 h-64" />;
  if (!shift) {
    return (
      <div className="p-6">
        <p>No hay un turno abierto en {reg.registerName}.</p>
        <Button onClick={() => navigate("/caja")}>Ir a Caja</Button>
      </div>
    );
  }

  const counted = countTotal(counts);
  const v = view.data;
  const system = Object.fromEntries(
    OTHER.map((o) => [
      o.method,
      v?.summary.byMethod[o.method as PaymentMethodCode].amountCents ?? 0,
    ]),
  );
  const countedOther = Object.fromEntries(
    OTHER.filter((o) => other[o.method] !== undefined && other[o.method] !== "").map((o) => [
      o.method,
      parseMoney(other[o.method] ?? "") ?? 0,
    ]),
  );
  const result = v
    ? closeResult({
        expectedCashCents: v.summary.expectedCashCents,
        countedCashCents: counted,
        system,
        counted: countedOther,
        toleranceCents: v.toleranceCents,
      })
    : null;
  const leftCents =
    left === null
      ? Math.min(counted, shift.openingFloatCents || 2_000_000)
      : (parseMoney(left) ?? 0);
  const withdrawn = Math.max(0, counted - leftCents);
  const needsNote = result?.overTolerance ?? false;

  const close = async () => {
    if (!me || !v || !result) return;
    if (needsNote && !note.trim()) return;
    const otherMedia = Object.fromEntries(
      OTHER.map((o) => [
        o.method,
        {
          counted: countedOther[o.method] ?? system[o.method] ?? 0,
          expected: system[o.method] ?? 0,
        },
      ]),
    );
    await closeShiftLocal({
      memberId: me.member.id,
      shiftId: shift.id,
      countedCashCents: counted,
      counts,
      otherMedia,
      expectedCashCents: v.summary.expectedCashCents,
      note: note.trim() || null,
      leftFloatCents: leftCents,
    });
    const cashier =
      ((await localDb().members.get(shift.memberId))?.name as string | undefined) ?? me.member.name;
    setLines(
      closingLines(
        {
          business: me.business,
          registerName: reg.registerName,
          shiftLabel: shiftName(new Date(shift.openedAt)),
          cashier,
          openedAt: new Date(shift.openedAt),
          closedAt: new Date(),
          lines: v.summary.lines,
          expectedCashCents: v.summary.expectedCashCents,
          countedCashCents: counted,
          differenceCents: result.cashDifferenceCents,
          byMethod: (Object.keys(METHOD_LABEL) as PaymentMethodCode[])
            .filter((m) => v.summary.byMethod[m].count > 0)
            .map((m) => ({
              label: METHOD_LABEL[m],
              amountCents: v.summary.byMethod[m].amountCents,
              count: v.summary.byMethod[m].count,
            })),
          salesCents: v.summary.salesCents,
          leftFloatCents: leftCents,
          withdrawnCents: withdrawn,
          note: note.trim() || null,
        },
        settings.tickets.width,
      ),
    );
    setStep("done");
  };

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="m-0 text-[22px] font-semibold">
          Arqueo y cierre · {reg.registerName} · {shiftName(new Date(shift.openedAt))}
        </h1>
        <span className="text-texto-suave">{reg.cashierName}</span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[480px_minmax(0,1fr)]">
        <section
          aria-label="Contá el efectivo"
          className="flex flex-col overflow-hidden rounded-card border border-borde bg-superficie"
        >
          <div className="flex items-center gap-2 border-b border-borde px-4 py-3">
            <span className="font-semibold">1 · Contá el efectivo</span>
            <span className="flex-1" />
            {settings.cash.blindCount ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-texto-suave">
                <EyeOff size={14} aria-hidden /> Conteo ciego: no ves el esperado
              </span>
            ) : (
              <span className="text-xs text-texto-suave">
                Esperado {formatMoney(v?.summary.expectedCashCents ?? 0)}
              </span>
            )}
          </div>
          {settings.cash.denominations.map((d) => {
            const n = counts[String(d)] ?? 0;
            return (
              <div
                key={d}
                className="grid h-14 grid-cols-[90px_1fr_110px] items-center gap-3 border-b border-borde px-4 lg:h-12"
              >
                <span className="tnum font-semibold">{formatMoney(d * 100)}</span>
                <Stepper
                  big
                  label={`billetes de ${formatMoney(d * 100)}`}
                  value={n}
                  onChange={(x) => setCounts((c) => ({ ...c, [String(d)]: x }))}
                />
                <span className="tnum text-right text-texto-suave">
                  {n ? formatMoney(d * 100 * n) : ""}
                </span>
              </div>
            );
          })}
          <div className="mt-auto flex items-center justify-between border-t border-borde bg-fondo px-4 py-3.5">
            <span className="font-semibold">Efectivo contado</span>
            <output
              aria-label="Efectivo contado"
              className="tnum text-[28px] font-semibold tracking-[-.02em]"
            >
              {formatMoney(counted)}
            </output>
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section
            aria-label="Otros medios"
            className="flex flex-col gap-2.5 rounded-card border border-borde bg-superficie px-5 py-4"
          >
            <div className="font-semibold">2 · Otros medios, según cupones y app del banco</div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {OTHER.map((o) => (
                <TextField
                  key={o.method}
                  label={o.label}
                  inputMode="decimal"
                  value={other[o.method] ?? ""}
                  onChange={(e) => setOther((x) => ({ ...x, [o.method]: e.target.value }))}
                  placeholder="0"
                />
              ))}
            </div>
            {step === "count" && (
              <Button className="self-start" onClick={() => setStep("result")} disabled={!v}>
                Ver resultado
              </Button>
            )}
          </section>

          {step === "result" && result && (
            <section
              aria-label="Resultado"
              className="flex flex-col overflow-hidden rounded-card border border-borde bg-superficie"
            >
              <div className="border-b border-borde px-5 py-3 font-semibold">3 · Resultado</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="h-8 bg-fondo text-left text-xs font-semibold text-texto-suave">
                    <th className="px-5 font-semibold">Medio</th>
                    <th className="text-right font-semibold">Sistema</th>
                    <th className="text-right font-semibold">Contado</th>
                    <th className="px-5 text-right font-semibold">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.method} className="h-10 border-b border-borde">
                      <td className="px-5">{r.label}</td>
                      <td className="tnum text-right text-texto-suave">
                        {formatMoney(r.systemCents)}
                      </td>
                      <td className="tnum text-right">{formatMoney(r.countedCents)}</td>
                      <td
                        className={cx(
                          "tnum px-5 text-right font-semibold",
                          r.differenceCents > 0
                            ? "text-exito"
                            : r.differenceCents < 0
                              ? "text-peligro"
                              : "",
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          {r.differenceCents > 0 ? (
                            <Plus size={14} aria-hidden />
                          ) : r.differenceCents < 0 ? (
                            <Minus size={14} aria-hidden />
                          ) : null}
                          {signedMoney(r.differenceCents)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {needsNote && (
                <div
                  role="alert"
                  className="mx-5 mt-3 flex items-center gap-3 rounded-lg bg-peligro-suave px-3.5 py-3 text-peligro"
                >
                  <CircleAlert size={20} aria-hidden />
                  <div className="flex flex-col">
                    <span className="font-semibold">
                      {result.cashDifferenceCents < 0 ? "Faltan" : "Sobran"}{" "}
                      {formatMoney(Math.abs(result.cashDifferenceCents))} en efectivo, más que la
                      tolerancia de {formatMoney(v?.toleranceCents ?? 0)}
                    </span>
                    <span className="text-[13px]">
                      El comentario es obligatorio y el dueño recibe un aviso.
                    </span>
                  </div>
                </div>
              )}
              <div className="mx-5 mt-3">
                <TextField
                  label={needsNote ? "Comentario (obligatorio)" : "Comentario"}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="¿Qué pasó?"
                  error={needsNote && !note.trim() ? "Contá qué pasó para poder cerrar." : null}
                />
              </div>
              <div className="mx-5 mt-3 grid grid-cols-2 gap-2.5">
                <TextField
                  label="Queda de fondo para el próximo turno"
                  inputMode="decimal"
                  value={left ?? moneyInput(leftCents)}
                  onChange={(e) => setLeft(e.target.value)}
                />
                <div className="flex flex-col gap-0.5 rounded-lg border border-borde px-3 py-2.5">
                  <span className="text-xs text-texto-suave">Se retira a la caja fuerte</span>
                  <span className="tnum text-lg font-semibold">{formatMoney(withdrawn)}</span>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2 border-t border-borde px-5 py-3.5">
                <Button variant="secondary" onClick={() => setStep("count")}>
                  Volver a contar
                </Button>
                <Button onClick={() => void close()} disabled={needsNote && !note.trim()}>
                  Cerrar turno y avisar al dueño
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
