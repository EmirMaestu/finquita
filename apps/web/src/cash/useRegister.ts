import { useEffect, useState } from "react";
import { useMe } from "../app/session";
import { localDb } from "../data/db";
import { useLive } from "../data/live";
import type { LocalShift } from "../data/types";
import { deviceRegisterId } from "./local";

/** La caja del dispositivo y su turno abierto (de la copia local, en vivo). */
export function useRegister(): {
  registerId: string | null;
  registerName: string;
  shift: LocalShift | null;
  cashierName: string | null;
  ready: boolean;
} {
  const me = useMe();
  const [registerId, setRegisterId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void deviceRegisterId(me?.device?.registerId).then((id) => {
      setRegisterId(id);
      setReady(true);
    });
  }, [me?.device?.registerId]);
  const data = useLive(
    async () => {
      const db = localDb();
      if (!registerId) {
        const id = await deviceRegisterId(me?.device?.registerId);
        if (id && id !== registerId) setRegisterId(id);
        return { shift: null, name: "Caja 1", cashier: null };
      }
      const reg = await db.registers.get(registerId);
      const shifts = (await db.shifts.where("registerId").equals(registerId).toArray()).filter(
        (s) => s.status === "open",
      );
      const shift = shifts.sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1))[0] ?? null;
      const cashier = shift
        ? ((await db.members.get(shift.memberId))?.name as string | undefined)
        : undefined;
      return {
        shift,
        name: (reg?.name as string | undefined) ?? "Caja 1",
        cashier: cashier ?? null,
      };
    },
    [registerId],
    { shift: null, name: "Caja 1", cashier: null },
  );
  return {
    registerId,
    registerName: data.name,
    shift: data.shift,
    cashierName: data.cashier,
    ready,
  };
}
