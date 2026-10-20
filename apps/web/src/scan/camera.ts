/**
 * Escaneo continuo con la cámara: el mismo código vuelve a contar solo si salió del cuadro
 * (varios intentos seguidos sin lectura) o si pasó un rato largo. Si el producto queda quieto
 * frente a la cámara no se suma una unidad por segundo.
 */
export function createGapFilter(
  missesNeeded = 3,
  windowMs = 4000,
  now: () => number = () => Date.now(),
) {
  let lastCode = "";
  let acceptedAt = -Infinity;
  let misses = 0;
  return {
    /** Un intento sin lectura (nada en el cuadro). */
    miss() {
      misses++;
    },
    /** Una lectura: devuelve true si hay que tomarla. */
    read(code: string): boolean {
      const t = now();
      const repeated = code === lastCode && misses < missesNeeded && t - acceptedAt < windowMs;
      misses = 0;
      if (repeated) return false;
      lastCode = code;
      acceptedAt = t;
      return true;
    },
  };
}

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
