/** Escaneo continuo: el mismo código seguido no se cuenta dos veces dentro de la ventana. */
export function createRepeatFilter(windowMs = 1500, now: () => number = () => Date.now()) {
  let lastCode = "";
  let lastAt = -Infinity;
  return (code: string): boolean => {
    const t = now();
    if (code === lastCode && t - lastAt < windowMs) {
      lastAt = t;
      return false;
    }
    lastCode = code;
    lastAt = t;
    return true;
  };
}
