import { formatMoney } from "@mostrador/shared";
import { Camera, ScanBarcode } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useViewport } from "../../app/useViewport";
import { findByCode } from "../../data/catalog";
import type { LocalProduct } from "../../data/types";
import { beep } from "../../scan/beep";
import { scanRouter } from "../../scan/GlobalScan";
import { Button } from "../../ui/Button";
import { toast } from "../../ui/toast";
import { QuickCreateForm } from "./QuickCreate";

type Loaded = { id: string; name: string; code: string | null; priceCents: number };

/**
 * Modo carga: pistola en la Mac o cámara en el iPhone. El código ya aparece puesto,
 * nombre, precio, Enter y el siguiente.
 */
export function LoadModePage() {
  const { layout } = useViewport();
  const phone = layout === "phone";
  const navigate = useNavigate();
  const [code, setCode] = useState<string | null>(null);
  const [existing, setExisting] = useState<LocalProduct | null>(null);
  const [loaded, setLoaded] = useState<Loaded[]>([]);

  useEffect(() => {
    return scanRouter.claim(async (c) => {
      scanRouter.closeCamera();
      const p = await findByCode(c);
      if (p) {
        beep("error");
        setExisting(p);
        setCode(null);
        return;
      }
      beep("ok");
      setExisting(null);
      setCode(c);
    });
  }, []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="m-0 text-[22px] font-semibold">Modo carga</h1>
          <p className="m-0 text-sm text-texto-suave">
            {phone
              ? "Escaneá con la cámara, poné nombre y precio, y seguí con el próximo."
              : "Escaneá con la pistola: el código aparece solo. Nombre, precio, Enter y el siguiente."}
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate("/productos")}>
          Terminar
        </Button>
      </div>

      <section
        className="rounded-card border border-borde bg-superficie p-4 lg:p-5"
        aria-label="Producto a cargar"
      >
        {existing ? (
          <div className="flex flex-col gap-3">
            <div className="text-[15px]">
              Ese código ya está cargado: <strong>{existing.name}</strong> ·{" "}
              {formatMoney(existing.priceCents)}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => navigate(`/productos/${existing.id}`)}>
                Ver ficha
              </Button>
              <Button onClick={() => setExisting(null)}>Seguir cargando</Button>
            </div>
          </div>
        ) : code ? (
          <QuickCreateForm
            code={code}
            submitLabel={phone ? "Guardar y escanear otro" : "Guardar · Enter"}
            onCancel={() => setCode(null)}
            onCreated={(p) => {
              setLoaded((l) => [{ id: p.id, name: p.name, code, priceCents: p.priceCents }, ...l]);
              toast({ text: `Cargado: ${p.name}` });
              setCode(null);
              if (phone) scanRouter.openCamera();
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <ScanBarcode size={40} className="text-primario" aria-hidden />
            <div className="text-base font-semibold">Escaneá el próximo producto</div>
            {phone ? (
              <Button size="lg" icon={<Camera size={20} />} onClick={() => scanRouter.openCamera()}>
                Abrir la cámara
              </Button>
            ) : (
              <div className="text-sm text-texto-suave">La pistola escanea sin tocar nada.</div>
            )}
            <button
              type="button"
              className="text-sm font-semibold text-primario"
              onClick={() => setCode("")}
            >
              Cargar sin código
            </button>
          </div>
        )}
      </section>

      {loaded.length > 0 && (
        <section
          aria-label="Cargados ahora"
          className="rounded-card border border-borde bg-superficie"
        >
          <div className="border-b border-borde px-4 py-2.5 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
            Cargados ahora · {loaded.length}
          </div>
          <ul className="m-0 list-none p-0">
            {loaded.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 border-b border-borde px-4 py-2.5 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{l.name}</span>
                  <span className="text-xs text-texto-suave">{l.code || "Sin código"}</span>
                </div>
                <span className="tnum font-semibold">{formatMoney(l.priceCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
