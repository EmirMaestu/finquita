import {
  type ColumnMapping,
  formatMoney,
  guessMapping,
  IMPORT_FIELDS,
  type ImportField,
  parseCsv,
  readXlsx,
} from "@mostrador/shared";
import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, Upload } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { useSyncStatus } from "../../sync/status";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Toggle } from "../../ui/Field";
import { OfflineBanner } from "../../ui/States";
import { Steps } from "../../ui/Steps";

type Item = {
  line: number;
  action: "new" | "update" | "unchanged" | "error";
  name: string;
  errors: string[];
  warnings?: string[];
  changes?: Record<string, [unknown, unknown]>;
};
type Preview = {
  summary: { new: number; updated: number; unchanged: number; errors: number };
  items: Item[];
};

const STEPS = ["Subir archivo", "Relacionar columnas", "Vista previa", "Confirmar"];

/** Lee un .xlsx o .csv a filas de texto. */
export async function readSheetFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(await file.arrayBuffer());
  if (/\.(csv|txt)$/i.test(file.name)) return parseCsv(await file.text());
  throw new Error(
    "Subí un archivo .xlsx o .csv. Si es .xls viejo, guardalo como .xlsx desde Excel.",
  );
}

function describeChange(field: string, [a, b]: [unknown, unknown]) {
  const label: Record<string, string> = {
    priceCents: "Precio",
    costCents: "Costo",
    minStock: "Mínimo",
    name: "Nombre",
  };
  const fmt = (v: unknown) =>
    typeof v === "number" && field.endsWith("Cents") ? formatMoney(v) : v == null ? "—" : String(v);
  return `${label[field] ?? field}: ${fmt(a)} → ${fmt(b)}`;
}

/** Importar desde Excel: subir archivo → relacionar columnas → vista previa → confirmar. */
export function ImportPage() {
  const navigate = useNavigate();
  const can = useCan("change_prices");
  const { online } = useSyncStatus();
  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [updatePrices, setUpdatePrices] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Item["action"]>("new");

  const body = () => ({ rows, mapping, updatePrices });
  const preview = useMutation({
    mutationFn: () => api<Preview>("/api/import/products/preview", { body: body() }),
    onSuccess: (p) => {
      setStep(2);
      setTab(p.summary.new ? "new" : p.summary.updated ? "update" : "error");
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : "No se pudo armar la vista previa."),
  });
  const confirm = useMutation({
    mutationFn: () =>
      api<{ summary: Preview["summary"] }>("/api/import/products/confirm", { body: body() }),
    onSuccess: () => setStep(3),
    onError: (e) => setError(e instanceof ApiError ? e.message : "No se pudo importar."),
  });

  if (!can) return <NoPermissionFor perm="change_prices" />;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const r = await readSheetFile(file);
      if (r.length < 2) throw new Error("El archivo no tiene filas para importar.");
      setRows(r);
      setFileName(file.name);
      setMapping(guessMapping(r[0] ?? []));
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const headers = rows[0] ?? [];
  const recognized = Object.keys(mapping).length;
  const items = preview.data?.items.filter((i) => i.action === tab) ?? [];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <FileSpreadsheet size={24} className="text-primario" aria-hidden />
        <h1 className="m-0 flex-1 text-[22px] font-semibold">
          Importar productos{fileName ? ` · ${fileName}` : ""}
        </h1>
        <Steps steps={STEPS} current={step} />
      </div>
      {!online && (
        <OfflineBanner>
          Importar necesita internet. Cuando vuelva la conexión, seguí desde acá.
        </OfflineBanner>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-peligro-suave px-3 py-2 text-sm font-semibold text-peligro"
        >
          {error}
        </div>
      )}

      {step === 0 && (
        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed border-borde bg-superficie px-6 py-14 text-center hover:border-primario">
          <Upload size={32} className="text-primario" aria-hidden />
          <span className="text-base font-semibold">Elegí tu Excel o CSV</span>
          <span className="text-sm text-texto-suave">
            Una fila por producto, con encabezados: nombre, código, costo, precio, categoría, stock…
          </span>
          <input
            type="file"
            accept=".xlsx,.csv,.txt"
            aria-label="Archivo para importar"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
      )}

      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section
            className="flex flex-col gap-3 rounded-card border border-borde bg-superficie p-5"
            aria-label="Relacionar columnas"
          >
            <div>
              <div className="text-base font-semibold">Decinos qué es cada columna</div>
              <div className="text-sm text-texto-suave">
                Reconocimos {recognized} de {Object.keys(IMPORT_FIELDS).length} por el encabezado.
                Revisá y seguí.
              </div>
            </div>
            {(Object.keys(IMPORT_FIELDS) as ImportField[]).map((f) => (
              <label
                key={f}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-t border-borde pt-2 text-sm"
              >
                <span className="font-medium">{IMPORT_FIELDS[f]}</span>
                <select
                  aria-label={IMPORT_FIELDS[f]}
                  value={mapping[f] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMapping((m) => {
                      const next = { ...m };
                      if (v === "") delete next[f];
                      else next[f] = Number(v);
                      return next;
                    });
                  }}
                  className="h-10 rounded-lg border border-borde bg-superficie px-2"
                >
                  <option value="">— no importar</option>
                  {headers.map((h, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: las columnas del archivo son posiciones
                    <option key={i} value={i}>
                      {h || `Columna ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <Toggle
              label="Actualizar precios de los que ya existen"
              hint="Si lo apagás, a los que ya existen solo se les actualiza costo y mínimo."
              checked={updatePrices}
              onChange={setUpdatePrices}
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStep(0)}>
                Atrás
              </Button>
              <Button
                onClick={() => preview.mutate()}
                disabled={
                  !online ||
                  preview.isPending ||
                  mapping.name === undefined ||
                  mapping.price === undefined
                }
              >
                Ver vista previa
              </Button>
            </div>
          </section>
          <aside className="flex flex-col gap-2 rounded-card border border-borde bg-superficie p-5 text-[13px]">
            <span className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Primeras filas del archivo
            </span>
            {rows.slice(1, 4).map((r, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: filas de muestra
              <div key={i} className="truncate rounded-lg bg-fondo px-2 py-1.5">
                {r.filter(Boolean).join(" · ")}
              </div>
            ))}
            <span className="text-texto-suave">
              {rows.length - 1} filas · {headers.length} columnas
            </span>
          </aside>
        </div>
      )}

      {step === 2 && preview.data && (
        <section
          className="flex flex-col gap-3 rounded-card border border-borde bg-superficie p-5"
          aria-label="Vista previa"
        >
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["new", `${preview.data.summary.new} nuevos`, "ok"],
                ["update", `${preview.data.summary.updated} actualizados`, "info"],
                ["unchanged", `${preview.data.summary.unchanged} sin cambios`, "neutro"],
                ["error", `${preview.data.summary.errors} con error`, "peligro"],
              ] as const
            ).map(([id, label, tone]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-pressed={tab === id}
                className={cx("rounded-full", tab === id && "ring-2 ring-texto")}
              >
                <Chip tone={tone} size="md">
                  {label}
                </Chip>
              </button>
            ))}
          </div>
          <p className="m-0 text-sm text-texto-suave">
            Los errores se muestran con su fila y no frenan al resto.
          </p>
          <ul className="m-0 max-h-[50vh] list-none overflow-y-auto p-0">
            {items.map((i) => (
              <li key={i.line} className="flex flex-col gap-0.5 border-t border-borde py-2 text-sm">
                <span className="font-medium">
                  <span className="text-texto-suave">Fila {i.line} · </span>
                  {i.name || "(sin nombre)"}
                </span>
                {i.errors.map((e) => (
                  <span key={e} className="text-peligro">
                    {e}
                  </span>
                ))}
                {Object.entries(i.changes ?? {}).map(([f, ch]) => (
                  <span key={f} className="text-texto-suave">
                    {describeChange(f, ch)}
                  </span>
                ))}
                {i.warnings?.map((w) => (
                  <span key={w} className="text-alerta">
                    {w}
                  </span>
                ))}
              </li>
            ))}
            {!items.length && (
              <li className="py-3 text-sm text-texto-suave">Nada en este grupo.</li>
            )}
          </ul>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Atrás
            </Button>
            <Button
              onClick={() => confirm.mutate()}
              disabled={
                !online ||
                confirm.isPending ||
                preview.data.summary.new + preview.data.summary.updated === 0
              }
            >
              Importar {preview.data.summary.new + preview.data.summary.updated} productos
            </Button>
          </div>
        </section>
      )}

      {step === 3 && confirm.data && (
        <section
          className="flex flex-col items-start gap-3 rounded-card border border-borde bg-superficie p-5"
          aria-label="Listo"
        >
          <div className="text-lg font-semibold">
            Listo: se importaron {confirm.data.summary.new + confirm.data.summary.updated} productos
          </div>
          <div className="text-sm text-texto-suave">
            {confirm.data.summary.new} nuevos y {confirm.data.summary.updated} actualizados.{" "}
            {confirm.data.summary.errors
              ? `${confirm.data.summary.errors} filas con error quedaron afuera.`
              : ""}
          </div>
          <Button onClick={() => navigate("/productos")}>Ver productos</Button>
        </section>
      )}
    </div>
  );
}
