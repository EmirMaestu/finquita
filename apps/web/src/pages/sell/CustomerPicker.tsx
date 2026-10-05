import { formatMoney } from "@mostrador/shared";
import { useEffect, useState } from "react";
import { useMe } from "../../app/session";
import { createCustomerLocal, localBalance, searchCustomers } from "../../data/customers";
import type { LocalCustomer } from "../../data/types";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";

/** F5: asignar cliente o fiado. Buscar o crear con dos campos. */
export function CustomerPicker({
  onPick,
  onClear,
  current,
  onClose,
}: {
  onPick: (c: LocalCustomer) => void;
  onClear: () => void;
  current: string | null;
  onClose: () => void;
}) {
  const me = useMe();
  const [q, setQ] = useState("");
  const [list, setList] = useState<(LocalCustomer & { balance: number })[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    void (async () => {
      const found = await searchCustomers(q);
      setList(
        await Promise.all(found.map(async (c) => ({ ...c, balance: await localBalance(c) }))),
      );
    })();
  }, [q]);
  return (
    <Sheet open onClose={onClose} title="Asignar cliente o fiado">
      {creating ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!me || !name.trim()) return;
            onPick(await createCustomerLocal(me.member.id, { name, phone }));
          }}
        >
          <TextField
            label="Nombre o apodo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rosa Giménez"
          />
          <TextField
            label="Teléfono"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Opcional"
          />
          <p className="m-0 text-[13px] text-texto-suave">
            Arranca sin límite de fiado: lo carga un encargado o el dueño. Mientras tanto, fiarle
            pide PIN.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)} className="flex-1">
              Volver
            </Button>
            <Button type="submit" className="flex-1" disabled={!name.trim()}>
              Crear y asignar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <TextField
            label="Buscar cliente"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre, apodo o teléfono"
          />
          <ul className="m-0 list-none p-0" aria-label="Clientes">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex min-h-14 w-full items-center gap-3 border-b border-borde text-left"
                >
                  <span className="flex-1">
                    <span className="font-semibold">{c.name}</span>
                    <span className="block text-[13px] text-texto-suave">
                      Límite {formatMoney(c.creditLimitCents)}
                      {c.overdueCents ? ` · vencido ${formatMoney(c.overdueCents)}` : ""}
                    </span>
                  </span>
                  <span
                    className={`tnum font-semibold ${c.overdueCents ? "text-peligro" : c.balance < 0 ? "text-exito" : ""}`}
                  >
                    {formatMoney(c.balance)}
                  </span>
                </button>
              </li>
            ))}
            {!list.length && (
              <li className="py-3 text-sm text-texto-suave">
                No encontramos a nadie con ese nombre.
              </li>
            )}
          </ul>
          <div className="flex gap-2">
            {current && (
              <Button variant="secondary" onClick={onClear} className="flex-1">
                Quitar cliente
              </Button>
            )}
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setName(q);
                setCreating(true);
              }}
            >
              Nuevo cliente
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
