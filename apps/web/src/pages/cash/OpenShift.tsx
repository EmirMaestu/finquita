import {
  countTotal,
  formatMoney,
  formatTime,
  moneyInput,
  parseMoney,
  shiftName,
} from "@mostrador/shared";
import { CircleCheck, Lock, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useMe } from "../../app/session";
import { useViewport } from "../../app/useViewport";
import { lastClosedOf, openShiftLocal } from "../../cash/local";
import { localDb } from "../../data/db";
import { useSettings } from "../../data/settings";
import type { LocalShift } from "../../data/types";
import { Button } from "../../ui/Button";
import { FilterChip } from "../../ui/Chip";
import { TextField } from "../../ui/Field";
import { Stepper } from "../../ui/Stepper";

/** Abrir turno: se cuenta el fondo por billete o se tipea el total, y se compara con lo que quedó. */
export function OpenShift({
  registerId,
  registerName,
  onOpened,
}: {
  registerId: string;
  registerName: string;
  onOpened?: (id: string) => void;
}) {
  const me = useMe();
  const settings = useSettings();
  const { layout } = useViewport();
  // En el celular, el total directo primero: contar por billete son dos pantallas de + y −.
  const [mode, setMode] = useState<"bills" | "total">(
    layout === "desktop" || layout === "wide" ? "bills" : "total",
  );
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [prev, setPrev] = useState<{ shift: LocalShift; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const s = await lastClosedOf(registerId);
      if (!s) return;
      const m = await localDb().members.get(s.memberId);
      setPrev({ shift: s, name: (m?.name as string | undefined) ?? "El turno anterior" });
    })();
  }, [registerId]);

  const counted = mode === "bills" ? countTotal(counts) : (parseMoney(total) ?? 0);
  const badTotal = mode === "total" && total.trim() !== "" && parseMoney(total) === null;
  const left = prev?.shift.leftFloatCents ?? null;
  // Se compara recién cuando se contó algo: con el contador en cero no hay nada que no coincida.
  const started = mode === "bills" ? Object.values(counts).some((n) => n > 0) : total.trim() !== "";
  const differs = left !== null && started && counted !== left;
  const now = new Date();

  const open = async () => {
    if (!me) return;
    setError(null);
    if (counted < 0) return setError("El fondo no puede ser negativo.");
    setBusy(true);
    try {
      const id = await openShiftLocal({
        memberId: me.member.id,
        registerId,
        openingFloatCents: counted,
        counts: mode === "bills" ? counts : null,
        note: note.trim() || null,
      });
      onOpened?.(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la caja.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="Abrir turno"
      className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-card border border-borde bg-superficie p-5"
      onKeyDown={(e) => {
        // Enter en el fondo o en un billete abre el turno (no hace falta tabular hasta el botón).
        if (e.key === "Enter" && e.target instanceof HTMLInputElement && !busy) {
          e.preventDefault();
          if (!badTotal && !(differs && !note.trim())) void open();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-neutro-suave text-texto-suave">
          <Lock size={24} aria-hidden />
        </span>
        <div>
          <h2 className="m-0 text-[22px] font-semibold">Abrí la caja</h2>
          <div className="text-sm text-texto-suave">
            {registerName} · {shiftName(now)}
          </div>
        </div>
      </div>
      {prev && left !== null && (
        <div className="rounded-lg bg-info-suave px-3 py-2 text-sm text-info">
          {prev.name} dejó {formatMoney(left)} de cambio
          {prev.shift.closedAt ? ` a las ${formatTime(new Date(prev.shift.closedAt))}` : ""}.
        </div>
      )}
      <div className="flex gap-2">
        <FilterChip active={mode === "bills"} onClick={() => setMode("bills")}>
          Por billete
        </FilterChip>
        <FilterChip
          active={mode === "total"}
          onClick={() => {
            setMode("total");
            if (!total) setTotal(moneyInput(counted || left || 0));
          }}
        >
          Total directo
        </FilterChip>
      </div>
      {mode === "bills" ? (
        <div className="flex flex-col">
          {settings.cash.denominations.map((d) => {
            const n = counts[String(d)] ?? 0;
            return (
              <div
                key={d}
                className="grid grid-cols-[72px_1fr_84px] items-center gap-2 lg:grid-cols-[90px_1fr_110px] lg:gap-3 border-b border-borde py-1.5"
              >
                <span className="tnum font-semibold">{formatMoney(d * 100)}</span>
                <Stepper
                  big
                  label={`billetes de ${formatMoney(d * 100)}`}
                  value={n}
                  onChange={(v) => setCounts((c) => ({ ...c, [String(d)]: v }))}
                />
                <span className="tnum text-right text-texto-suave">
                  {n ? formatMoney(d * 100 * n) : ""}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <TextField
          label="Fondo inicial"
          inputMode="decimal"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="20000"
          error={badTotal ? "Poné un monto, por ejemplo 20000." : undefined}
        />
      )}
      <div className="flex items-baseline justify-between border-t border-borde pt-3">
        <span className="font-semibold">Fondo contado</span>
        <span className="tnum text-[28px] font-semibold tracking-[-.02em]">
          {formatMoney(counted)}
        </span>
      </div>
      {left !== null &&
        started &&
        (differs ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-alerta">
              <TriangleAlert size={16} aria-hidden /> No coincide con lo que dejó {prev?.name} (
              {formatMoney(left)}). Contá qué pasó.
            </div>
            <TextField
              label="Comentario"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Faltaba cambio de $ 500"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-semibold text-exito">
            <CircleCheck size={16} aria-hidden /> Coincide con lo que dejó {prev?.name}
          </div>
        ))}
      {error && (
        <div role="alert" className="text-[13px] font-semibold text-peligro">
          {error}
        </div>
      )}
      <Button
        size="xl"
        onClick={() => void open()}
        disabled={busy || badTotal || (differs && !note.trim())}
      >
        Abrir {shiftName(now)} en {registerName}
      </Button>
    </section>
  );
}
