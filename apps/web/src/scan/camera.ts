/**
 * Escaneo continuo: el mismo código seguido no se cuenta dos veces dentro de la ventana.
 * La ventana se cuenta desde la lectura aceptada (no se renueva con cada repetición): si el
 * producto sigue en cuadro, a los 1,5 s vuelve a sumar (dos unidades seguidas sí entran).
 */
export function createRepeatFilter(windowMs = 1500, now: () => number = () => Date.now()) {
  let lastCode = "";
  let acceptedAt = -Infinity;
  return (code: string): boolean => {
    const t = now();
    if (code === lastCode && t - acceptedAt < windowMs) return false;
    lastCode = code;
    acceptedAt = t;
    return true;
  };
}
