import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "./cx";

export type MenuItem = { label: string; onSelect: () => void; icon?: ReactNode; hidden?: boolean };

/** Menú desplegable ("Más acciones"). */
export function Menu({
  label,
  items,
  className,
  align = "right",
}: {
  label: string;
  items: MenuItem[];
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k);
    };
  }, [open]);
  return (
    <div ref={ref} className={cx("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-borde bg-superficie px-3 text-[13px] font-semibold hover:bg-neutro-suave"
      >
        {label}
        <ChevronDown size={16} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className={cx(
            "absolute top-11 z-30 flex w-60 flex-col rounded-card border border-borde bg-superficie p-1 shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items
            .filter((i) => !i.hidden)
            .map((i) => (
              <button
                key={i.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  i.onSelect();
                }}
                className="flex h-10 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium hover:bg-neutro-suave"
              >
                {i.icon}
                {i.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
