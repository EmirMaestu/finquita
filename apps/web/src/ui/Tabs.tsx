import { cx } from "./cx";

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx(
        "flex gap-0.5 overflow-x-auto border-b border-borde text-[13px] font-semibold text-texto-suave",
        className,
      )}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "-mb-px min-h-10 shrink-0 border-b-2 px-2.5 py-1.5",
            value === t.id
              ? "border-primario text-primario"
              : "border-transparent hover:text-texto",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
