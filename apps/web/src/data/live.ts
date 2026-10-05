import { liveQuery } from "dexie";
import { type DependencyList, useEffect, useRef, useState } from "react";

/** Consulta a la copia local que se actualiza sola cuando cambian los datos. */
export function useLive<T>(query: () => Promise<T>, deps: DependencyList, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  const fn = useRef(query);
  fn.current = query;
  const key = JSON.stringify(deps);
  // biome-ignore lint/correctness/useExhaustiveDependencies: se vuelve a suscribir cuando cambian las dependencias
  useEffect(() => {
    const sub = liveQuery(() => fn.current()).subscribe({ next: setValue, error: () => {} });
    return () => sub.unsubscribe();
  }, [key]);
  return value;
}
