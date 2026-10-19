import { formatMoney, OP_LABEL_ES, saleNumberLabel } from "@mostrador/shared";
import { localDb } from "../data/db";
import { toast } from "../ui/toast";
import type { Rejected } from "./client";

/**
 * El servidor rechazó una operación: se deshace lo que la pantalla ya había dado por hecho
 * (la venta, el turno, el movimiento) y se avisa en el momento, no solo en Avisos.
 */
export async function revertRejected(r: Rejected): Promise<void> {
  const db = localDb();
  const p = r.op.payload as Record<string, unknown>;
  let what = OP_LABEL_ES[r.type] ?? "la operación";
  switch (r.type) {
    case "sale.create": {
      const id = String(p.id);
      const sale = (await db.sales.get(id)) as { number?: number } | undefined;
      if (sale?.number) what = `la venta ${saleNumberLabel(sale.number)}`;
      await db.sales.delete(id);
      await db.cashMoves.where("opId").equals(r.opId).delete();
      break;
    }
    case "cash.shift_open": {
      const id = String(p.shiftId);
      const s = await db.shifts.get(id);
      if (s && s.status === "open") await db.shifts.delete(id);
      await db.cashMoves
        .where("shiftId")
        .equals(id)
        .filter((m) => m.source === "local")
        .delete();
      break;
    }
    case "cash.shift_close": {
      const id = String(p.shiftId);
      const s = await db.shifts.get(id);
      if (s && s.status === "closed")
        await db.shifts.put({ ...s, status: "open", closedAt: null, leftFloatCents: null });
      break;
    }
    case "cash.movement":
    case "credit.payment":
    case "sale.void":
    case "sale.return": {
      await db.cashMoves.where("opId").equals(r.opId).delete();
      if (r.type === "cash.movement" && typeof p.amountCents === "number")
        what = `${what} de ${formatMoney(p.amountCents)}`;
      if (r.type === "sale.void") {
        const s = (await db.sales.get(String(p.saleId))) as { status?: string } | undefined;
        if (s?.status === "voided") await db.sales.put({ ...s, status: "completed" } as never);
      }
      break;
    }
    default:
      break;
  }
  toast({
    text: `El servidor no aceptó ${what}: ${r.reason}. Quedó en Avisos para revisar.`,
    tone: "error",
    ms: 8000,
  });
}
