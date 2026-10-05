import { formatDate, formatMoney, formatQty } from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ScanBarcode } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan, useGrant } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { localDb } from "../../data/db";
import { fetchCategories } from "../../data/products";
import { beep } from "../../scan/beep";
import { scanRouter } from "../../scan/GlobalScan";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { Chip, FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { SelectField, TextField } from "../../ui/Field";
import { NumPad } from "../../ui/NumPad";
import { Sheet } from "../../ui/Sheet";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";

type CountRow = {
  id: string;
  name: string;
  status: "open" | "submitted" | "approved" | "cancelled";
  total: number;
  counted: number;
  assignedName: string | null;
  createdAt: string;
};
type CountLine = {
  id: string;
  productId: string;
  name: string;
  saleUnit: "unit" | "kg" | "100g";
  barcodes: string[];
  countedQty: number | null;
  status: string;
  systemQty?: number;
  differenceQty?: number | null;
  differenceCents?: number;
};
type CountDetail = {
  id: string;
  name: string;
  status: CountRow["status"];
  reviewer: boolean;
  lines: CountLine[];
};

const STATUS: Record<CountRow["status"], [string, "info" | "alerta" | "ok" | "neutro"]> = {
  open: ["Contando", "info"],
  submitted: ["Para revisar", "alerta"],
  approved: ["Aprobado", "ok"],
  cancelled: ["Cancelado", "neutro"],
};

function NewCount({ onClose }: { onClose: (id?: string) => void }) {
  const cats = useQuery({ queryKey: ["categories"], queryFn: fetchCategories });
  const people = useQuery({
    queryKey: ["people"],
    queryFn: async () => (await localDb().members.toArray()).filter((m) => m.active !== false),
  });
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"all" | "category" | "location">("category");
  const [categoryId, setCategoryId] = useState("");
  const [location, setLocation] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/counts", {
        body: {
          name: name.trim(),
          scope,
          ...(scope === "category" ? { categoryId } : {}),
          ...(scope === "location" ? { location } : {}),
          assignedTo: assignedTo || null,
        },
      }),
    onSuccess: (r) => onClose(r.id),
    onError: (e) => setError(e instanceof ApiError ? e.message : "No se pudo crear."),
  });
  return (
    <Sheet
      open
      onClose={() => onClose()}
      title="Nuevo conteo"
      footer={
        <Button
          className="flex-1"
          onClick={() => create.mutate()}
          disabled={!name.trim() || create.isPending}
        >
          Crear conteo
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <TextField
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Góndola 3, Infusiones"
        />
        <div className="flex gap-2">
          <FilterChip active={scope === "all"} onClick={() => setScope("all")}>
            Todo
          </FilterChip>
          <FilterChip active={scope === "category"} onClick={() => setScope("category")}>
            Por categoría
          </FilterChip>
          <FilterChip active={scope === "location"} onClick={() => setScope("location")}>
            Por góndola
          </FilterChip>
        </div>
        {scope === "category" && (
          <SelectField
            label="Categoría"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Elegí</option>
            {(cats.data ?? []).flatMap((c) => [
              <option key={c.id} value={c.id}>
                {c.name}
              </option>,
              ...c.children.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {c.name} › {ch.name}
                </option>
              )),
            ])}
          </SelectField>
        )}
        {scope === "location" && (
          <TextField
            label="Góndola o ubicación"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Góndola 3"
          />
        )}
        <SelectField
          label="Asignar a"
          value={assignedTo}
          onChange={(e) => setAssignedTo(e.target.value)}
        >
          <option value="">Sin asignar</option>
          {(people.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {String(p.name)}
            </option>
          ))}
        </SelectField>
        {error && (
          <div role="alert" className="text-sm font-semibold text-peligro">
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Lista de conteos y alta. */
export function CountsPage() {
  const can = useCan("count_receive");
  const canCreate = useGrant("adjust_stock") === "allow";
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const q = useQuery({ queryKey: ["counts"], queryFn: () => api<CountRow[]>("/api/counts") });
  if (!can) return <NoPermissionFor perm="count_receive" />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <h1 className="m-0 flex-1 text-[22px] font-semibold">Conteos de inventario</h1>
        {canCreate && <Button onClick={() => setCreating(true)}>Nuevo conteo</Button>}
      </div>
      {q.isPending ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState message="Los conteos se ven con conexión." onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          title="Todavía no hay conteos"
          body="Creá uno por categoría o por góndola y asignáselo a alguien."
        />
      ) : (
        <ul
          className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
          aria-label="Conteos"
        >
          {q.data.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate(`/productos/conteos/${c.id}`)}
                className="flex min-h-16 w-full items-center gap-3 border-b border-borde px-4 text-left"
              >
                <span className="flex-1">
                  <span className="font-semibold">{c.name}</span>
                  <span className="block text-[13px] text-texto-suave">
                    {formatDate(new Date(c.createdAt))} · {c.assignedName ?? "sin asignar"} ·{" "}
                    {c.counted} de {c.total}
                  </span>
                </span>
                <Chip tone={STATUS[c.status][1]}>{STATUS[c.status][0]}</Chip>
              </button>
            </li>
          ))}
        </ul>
      )}
      {creating && (
        <NewCount
          onClose={(id) => {
            setCreating(false);
            if (id) navigate(`/productos/conteos/${id}`);
          }}
        />
      )}
    </div>
  );
}

/** Teclado de cantidad para lo contado. */
function QtyEntry({
  line,
  onSave,
  onClose,
}: {
  line: CountLine;
  onSave: (q: number) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const kg = line.saleUnit !== "unit";
  const onKey = useCallback(
    (k: string) =>
      setTyped((t) =>
        k === "back"
          ? t.slice(0, -1)
          : k === ","
            ? kg && !t.includes(",")
              ? `${t},`
              : t
            : (t + k).slice(0, 7),
      ),
    [kg],
  );
  const n = Number(typed.replace(",", "."));
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Enter" && typed) {
        e.preventDefault();
        onSave(n);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [typed, n, onSave]);
  return (
    <Sheet open onClose={onClose} title={line.name}>
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-borde bg-fondo px-4 py-3">
          <div className="text-xs text-texto-suave">Cantidad contada</div>
          <output
            aria-label="Cantidad contada"
            className="tnum text-[40px] leading-none font-semibold"
          >
            {typed || "0"}
            {kg ? " kg" : ""}
          </output>
        </div>
        <NumPad onKey={onKey} decimal={kg} big />
        <Button size="xl" disabled={!typed} onClick={() => onSave(n)}>
          Guardar · ⏎
        </Button>
      </div>
    </Sheet>
  );
}

/** Un conteo: modo conteo (ciego) mientras está abierto; revisión con diferencias para el encargado. */
export function CountPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<CountLine | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["count", id],
    queryFn: () => api<CountDetail>(`/api/counts/${id}`),
  });
  const save = useMutation({
    mutationFn: (a: { productId: string; countedQty: number }) =>
      api(`/api/counts/${id}/lines`, { method: "PUT", body: a }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["count", id] }),
  });
  const submit = useMutation({
    mutationFn: () => api(`/api/counts/${id}/submit`, { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["count", id] }),
  });
  const approve = useMutation({
    mutationFn: (lineIds?: string[]) =>
      api<{ approved: number; moved: number }>(`/api/counts/${id}/approve`, {
        body: lineIds ? { lineIds } : {},
      }),
    onSuccess: (r) => {
      toast({ text: `Aprobado: ${r.approved} productos, ${r.moved} con diferencia` });
      void qc.invalidateQueries({ queryKey: ["count", id] });
    },
  });
  const lines = q.data?.lines ?? [];
  const open = q.data?.status === "open";
  const byCode = useMemo(() => {
    const m = new Map<string, CountLine>();
    for (const l of lines) for (const c of l.barcodes) m.set(c, l);
    return m;
  }, [lines]);
  useEffect(() => {
    if (!open) return;
    return scanRouter.claim(async (code) => {
      let l = byCode.get(code);
      if (!l) {
        const { findByCode } = await import("../../data/catalog");
        const p = await findByCode(code);
        l = lines.find((x) => x.productId === p?.id);
      }
      if (!l) {
        beep("error");
        toast({ text: "Ese producto no está en este conteo", tone: "error" });
        return;
      }
      beep("ok");
      scanRouter.closeCamera();
      setEntry(l);
    });
  }, [open, byCode, lines]);

  if (q.isPending) return <SkeletonList className="p-6" />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const c = q.data;
  const counted = lines.filter((l) => l.countedQty !== null).length;
  const review = c.reviewer && c.status !== "open";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-[22px] font-semibold">{c.name}</h1>
        <output
          aria-label="Avance"
          className="rounded-full bg-neutro-suave px-3 py-1 text-sm font-semibold"
        >
          {counted} de {lines.length}
        </output>
        <Chip tone={STATUS[c.status][1]} size="md">
          {STATUS[c.status][0]}
        </Chip>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-card border border-borde bg-superficie p-4">
          <ScanBarcode size={24} className="text-primario" aria-hidden />
          <span className="flex-1 text-sm">
            Escaneá cada producto y tipeá cuántos hay. Es un conteo ciego: no se ve el stock del
            sistema.
          </span>
          <Button variant="secondary" onClick={() => scanRouter.openCamera()}>
            Cámara
          </Button>
        </div>
      )}
      <ul
        className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
        aria-label="Productos del conteo"
      >
        {lines.map((l) => {
          const unit = l.saleUnit === "unit" ? "unit" : "kg";
          return (
            <li
              key={l.id}
              className="flex min-h-14 items-center gap-3 border-b border-borde px-4 last:border-b-0"
            >
              {review && c.status === "submitted" && l.status === "pending" && (
                <Checkbox
                  label={`Elegir ${l.name}`}
                  checked={selected.has(l.id)}
                  onChange={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (v) n.add(l.id);
                      else n.delete(l.id);
                      return n;
                    })
                  }
                />
              )}
              <button
                type="button"
                disabled={!open}
                onClick={() => setEntry(l)}
                className="flex min-w-0 flex-1 flex-col text-left"
              >
                <span className="truncate font-medium">{l.name}</span>
                {review && l.systemQty !== undefined && (
                  <span className="text-[13px] text-texto-suave">
                    Sistema {formatQty(l.systemQty, unit)}
                  </span>
                )}
              </button>
              <span className="tnum font-semibold">
                {l.countedQty !== null ? (
                  formatQty(l.countedQty, unit)
                ) : (
                  <span className="text-texto-apagado">—</span>
                )}
              </span>
              {review && l.differenceQty != null && (
                <span
                  className={cx(
                    "tnum min-w-24 text-right text-sm font-semibold",
                    l.differenceQty < 0
                      ? "text-peligro"
                      : l.differenceQty > 0
                        ? "text-exito"
                        : "text-texto-suave",
                  )}
                >
                  {l.differenceQty > 0 ? "+" : l.differenceQty < 0 ? "−" : ""}
                  {formatQty(Math.abs(l.differenceQty), unit)}
                  {l.differenceCents !== undefined && l.differenceCents !== 0 && (
                    <span className="block text-xs">
                      {l.differenceCents > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(l.differenceCents))}
                    </span>
                  )}
                </span>
              )}
              {open && l.countedQty !== null && (
                <CircleCheck size={18} className="text-exito" aria-label="Contado" />
              )}
            </li>
          );
        })}
      </ul>
      {open && (
        <Button
          size="lg"
          className="self-start"
          onClick={() => submit.mutate()}
          disabled={!counted}
        >
          Terminar conteo
        </Button>
      )}
      {review && c.status === "submitted" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => approve.mutate([...selected])}
            disabled={!selected.size}
          >
            Aprobar elegidos
          </Button>
          <Button onClick={() => approve.mutate(undefined)}>Aprobar todo</Button>
        </div>
      )}
      {!open && !review && (
        <div className="text-sm text-texto-suave">Listo: lo revisa un encargado o el dueño.</div>
      )}
      <Button variant="ghost" className="self-start" onClick={() => navigate("/productos/conteos")}>
        Volver a conteos
      </Button>
      {entry && (
        <QtyEntry
          line={entry}
          onClose={() => setEntry(null)}
          onSave={(qty) => {
            save.mutate({ productId: entry.productId, countedQty: qty });
            setEntry(null);
          }}
        />
      )}
    </div>
  );
}
