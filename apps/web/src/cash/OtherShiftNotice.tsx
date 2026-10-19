import { formatTime } from "@mostrador/shared";
import { Info } from "lucide-react";
import { useNavigate } from "react-router";
import { useMe } from "../app/session";
import { useRegister } from "./useRegister";

/** La caja la abrió otra persona: se avisa y se ofrece cerrar ese turno antes de seguir. */
export function OtherShiftNotice({ className }: { className?: string }) {
  const me = useMe();
  const reg = useRegister();
  const navigate = useNavigate();
  const shift = reg.shift;
  if (!me || !shift || shift.memberId === me.member.id || !reg.cashierName) return null;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-2.5 rounded-lg bg-info-suave px-3.5 py-2.5 text-[13px] font-medium text-info ${className ?? ""}`}
    >
      <Info size={16} aria-hidden />
      <span className="flex-1">
        La caja la abrió {reg.cashierName} a las {formatTime(new Date(shift.openedAt))}: lo que
        vendas entra en su turno.
      </span>
      <button
        type="button"
        className="font-semibold underline"
        onClick={() => navigate("/caja/cierre")}
      >
        Cerrar el turno de {reg.cashierName}
      </button>
    </div>
  );
}
