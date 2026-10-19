/** Pista de tecla: se ve solo en la compu (en el celular no hay teclado). */
export function Key({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      aria-hidden
      className={`hidden rounded border border-current/30 px-1.5 py-0.5 text-[11px] font-semibold opacity-70 lg:inline ${className ?? ""}`}
    >
      {children}
    </kbd>
  );
}
