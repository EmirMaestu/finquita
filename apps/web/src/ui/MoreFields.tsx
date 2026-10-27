import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/** Campos opcionales plegados: el formulario muestra primero solo lo necesario. */
export function MoreFields({
  label = "Más datos (opcional)",
  open,
  children,
}: {
  label?: string;
  /** Abierto de entrada (por ejemplo, al editar algo que ya tiene esos datos). */
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-primario lg:h-9 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180" />
        {label}
      </summary>
      <div className="flex flex-col gap-3 pt-2">{children}</div>
    </details>
  );
}
