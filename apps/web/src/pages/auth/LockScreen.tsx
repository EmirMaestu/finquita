import { ROLE_LABEL, type Role } from "@mostrador/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError, api, credentials } from "../../data/api";
import { localDb } from "../../data/db";
import { cx } from "../../ui/cx";
import { PinPad } from "../../ui/PinPad";

type Person = { id: string; name: string; role: Role; hasPin: boolean };

/**
 * Cambio rápido de usuario en un dispositivo habilitado: se elige la persona y se tipea su PIN.
 * Sin conexión, la lista sale de la copia local.
 */
export function LockScreen({
  onPassword,
  onCancel,
}: {
  onPassword?: () => void;
  onCancel?: () => void;
}) {
  const qc = useQueryClient();
  const people = useQuery({
    queryKey: ["pin-members"],
    queryFn: async () => {
      try {
        return await api<Person[]>("/api/pin/members");
      } catch (err) {
        const local = (await localDb().members.toArray()) as unknown as Person[];
        if (local.length)
          return local.filter((p) => (p as unknown as { active: boolean }).active !== false);
        throw err;
      }
    },
  });
  const [who, setWho] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (pin: string) => {
    if (!who) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>("/api/pin/login", { body: { memberId: who.id, pin } });
      credentials.setPin(r.token);
      await qc.invalidateQueries({ queryKey: ["me"] });
      onCancel?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Sin conexión: no se pudo verificar el PIN.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fondo p-4">
      {who ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-borde bg-superficie px-5 py-6 shadow-xl">
          <PinPad
            title={`Hola, ${who.name}`}
            subtitle="Tipeá tu PIN"
            onSubmit={submit}
            onCancel={() => {
              setWho(null);
              setError(null);
            }}
            error={error}
            busy={busy}
          />
        </div>
      ) : (
        <div className="flex w-full max-w-md flex-col gap-4">
          <h1 className="m-0 text-center text-[22px] font-semibold">¿Quién va a usar la caja?</h1>
          {people.isError && (
            <div className="text-center text-sm text-peligro">
              Este dispositivo no está habilitado. Pedile al dueño que lo habilite.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {(people.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!p.hasPin}
                onClick={() => setWho(p)}
                className={cx(
                  "flex min-h-24 flex-col items-center justify-center gap-1 rounded-card border border-borde bg-superficie p-3",
                  p.hasPin ? "hover:border-primario" : "opacity-50",
                )}
              >
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-acento-suave text-lg font-semibold">
                  {p.name.charAt(0)}
                </span>
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-texto-suave">
                  {p.hasPin ? ROLE_LABEL[p.role] : "Sin PIN"}
                </span>
              </button>
            ))}
          </div>
          <div className="flex justify-center gap-4">
            {onPassword && (
              <button
                type="button"
                className="h-12 text-sm font-semibold text-primario"
                onClick={onPassword}
              >
                Entrar con email
              </button>
            )}
            {onCancel && (
              <button
                type="button"
                className="h-12 text-sm font-semibold text-texto-suave"
                onClick={onCancel}
              >
                Volver
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
