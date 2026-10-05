export type Theme = "claro" | "oscuro" | "sistema";

/** Tema claro por defecto; el oscuro se elige en Ajustes o sigue al sistema. */
export function applyTheme(theme: Theme) {
  const dark =
    theme === "oscuro" ||
    (theme === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

export function savedTheme(): Theme {
  try {
    const t = localStorage.getItem("mostrador.theme");
    if (t === "oscuro" || t === "sistema") return t;
  } catch {}
  return "claro";
}
