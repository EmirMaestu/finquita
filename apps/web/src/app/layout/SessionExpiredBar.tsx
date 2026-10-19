import { LogIn } from "lucide-react";
import { useNavigate } from "react-router";
import { credentials } from "../../data/api";
import { lockScreen } from "../lock";
import { useSessionExpired } from "../sessionExpired";

/** Franja fija cuando la sesión venció: lo cargado se conserva y se vuelve a entrar desde acá. */
export function SessionExpiredBar() {
  const expired = useSessionExpired();
  const navigate = useNavigate();
  if (!expired) return null;
  const device = Boolean(credentials.get().deviceToken);
  return (
    <div
      role="alert"
      className="flex items-center gap-3 bg-alerta-suave px-4 py-2.5 text-[13px] font-medium text-alerta"
    >
      <span className="flex-1">
        Tu sesión venció. Lo que cargaste sigue acá: entrá de nuevo para guardarlo.
      </span>
      <button
        type="button"
        onClick={() => (device ? lockScreen.open() : navigate("/"))}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-alerta px-3 font-semibold text-white"
      >
        <LogIn size={16} aria-hidden /> Entrar de nuevo
      </button>
    </div>
  );
}
