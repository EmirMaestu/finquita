import { useEffect, useState } from "react";
import { useMe } from "../app/session";
import { localDb } from "../data/db";
import { useLive } from "../data/live";
import type { LocalShift } from "../data/types";
import { deviceRegisterId } from "./local";

type RegisterState = {
  registerId: string | null;
  registerName: string;
  shift: LocalShift | null;
  cashierName: string | null;
  /** Ya se leyó la copia local (antes de esto no se sabe si la caja está abierta). */
  ready: boolean;
};

/** La caja del dispositivo y su turno abierto (de la copia local, en vivo). */
export function useRegister(): RegisterState {
  const me = useMe();
  const [registerId, setRegisterId] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const data = useLive(
    async () => {
      const db = localDb();
      // Mientras no haya cajas en la copia local (primer sincronizado), se sigue esperando.
      const id = await deviceRegisterId(me?.device?.registerId);
      if (!id) return { loaded: false as const };
      const reg = await db.registers.get(id);
      const shifts = (await db.shifts.where("registerId").equals(id).toArray()).filter(
        (s) => s.status === "open",
      );
      const shift = shifts.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))[0] ?? null;
      const cashier = shift
        ? ((await db.members.get(shift.memberId))?.name as string | undefined)
        : undefined;
      return {
        loaded: true as const,
        id,
        shift,
        name: (reg?.name as string | undefined) ?? "Caja 1",
        cashier: cashier ?? null,
        hasRegister: Boolean(reg),
      };
    },
    [me?.device?.registerId],
    { loaded: false as const },
  );
  useEffect(() => {
    if (data.loaded) {
      setRegisterId(data.id);
      setResolved(data.hasRegister);
    }
  }, [data]);
  if (!data.loaded)
    return { registerId, registerName: "Caja 1", shift: null, cashierName: null, ready: false };
  return {
    registerId: data.id,
    registerName: data.name,
    shift: data.shift,
    cashierName: data.cashier,
    ready: resolved || data.hasRegister,
  };
}
