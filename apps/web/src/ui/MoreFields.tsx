import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

/** Campos opcionales plegados: el formulario muestra primero solo lo necesario. */
export function MoreFields({
  label = "Más datos (opcional)",
  open: openProp = false,
  children,
}: {
  label?: string;
  /** Abierto (por ejemplo, al editar algo que ya tiene esos datos). Una vez abierto, no se cierra solo. */
  open?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(openProp);
  useEffect(() => {
    if (openProp) setOpen(true);
  }, [openProp]);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group">
      <summary className="flex h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-primario lg:h-9 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={16} aria-hidden className="transition-transform group-open:rotate-180" />
        {label}
      </summary>
      <div className="flex flex-col gap-3 pt-2">{children}</div>
    </details>
  );
}
