import { formatPercent } from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { Button } from "../../ui/Button";
import { SelectField, TextField, Toggle } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";

type Category = {
  id: string;
  name: string;
  parentId: string | null;
  defaultMarginBp: number | null;
  ageRestricted: boolean;
  tracksExpiry: boolean;
  products: number;
  children?: Category[];
};

/** Categorías en dos niveles, con la ganancia por defecto de cada una. */
export function CategoriesPage() {
  const can = useCan("change_prices");
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/api/categories"),
  });
  const [form, setForm] = useState<{ c: Category | null; parentId: string | null } | null>(null);
  if (!can) return <NoPermissionFor perm="change_prices" />;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/productos")}
          className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primario hover:bg-primario-suave"
        >
          <ChevronLeft size={18} aria-hidden /> Productos
        </button>
        <h1 className="m-0 flex-1 text-[22px] font-semibold">Categorías</h1>
        <Button onClick={() => setForm({ c: null, parentId: null })}>Nueva categoría</Button>
      </div>
      <p className="m-0 text-sm text-texto-suave">
        La ganancia por defecto se usa al cargar un producto sin ganancia propia. Dos niveles: rubro
        y subrubro.
      </p>
      {q.isPending ? (
        <SkeletonList rows={6} />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <ul className="m-0 list-none p-0" aria-label="Categorías">
          {q.data.map((p) => (
            <li key={p.id} className="border-t border-borde py-2">
              <div className="flex items-center gap-3">
                <span className="flex-1 font-semibold">{p.name}</span>
                <span className="text-sm text-texto-suave">
                  {p.defaultMarginBp != null
                    ? `${formatPercent(p.defaultMarginBp)} de ganancia`
                    : "sin ganancia por defecto"}
                  {p.products ? ` · ${p.products} productos` : ""}
                </span>
                <Button variant="ghost" onClick={() => setForm({ c: p, parentId: null })}>
                  Editar
                </Button>
                <Button variant="ghost" onClick={() => setForm({ c: null, parentId: p.id })}>
                  Subrubro
                </Button>
              </div>
              {(p.children ?? []).map((ch) => (
                <div key={ch.id} className="flex items-center gap-3 pl-6 text-sm">
                  <span className="flex-1">{ch.name}</span>
                  <span className="text-texto-suave">
                    {ch.defaultMarginBp != null
                      ? `${formatPercent(ch.defaultMarginBp)}`
                      : `hereda ${p.defaultMarginBp != null ? formatPercent(p.defaultMarginBp) : "—"}`}
                    {ch.products ? ` · ${ch.products} productos` : ""}
                  </span>
                  <Button variant="ghost" onClick={() => setForm({ c: ch, parentId: p.id })}>
                    Editar
                  </Button>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
      {form && (
        <CategoryForm
          category={form.c}
          parentId={form.parentId}
          parents={(q.data ?? []).filter((p) => p.id !== form.c?.id)}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  );
}

function CategoryForm({
  category,
  parentId,
  parents,
  onClose,
}: {
  category: Category | null;
  parentId: string | null;
  parents: Category[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(category?.name ?? "");
  const [parent, setParent] = useState(category?.parentId ?? parentId ?? "");
  const [margin, setMargin] = useState(
    category?.defaultMarginBp != null ? String(category.defaultMarginBp / 100) : "",
  );
  const [adult, setAdult] = useState(category?.ageRestricted ?? false);
  const [expiry, setExpiry] = useState(category?.tracksExpiry ?? false);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const m = margin.trim() ? Number(margin.replace(",", ".")) : null;
      if (m !== null && !Number.isFinite(m))
        throw new Error("Ganancia: poné un porcentaje, por ejemplo 40.");
      const body = {
        name: name.trim(),
        parentId: parent || null,
        defaultMarginBp: m === null ? null : Math.round(m * 100),
        ageRestricted: adult,
        tracksExpiry: expiry,
      };
      return category
        ? api(`/api/categories/${category.id}`, { method: "PATCH", body })
        : api("/api/categories", { body });
    },
    onSuccess: async () => {
      toast({ text: category ? "Categoría guardada" : `Categoría creada: ${name.trim()}` });
      await qc.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
    onError: (e) =>
      setError(e instanceof ApiError || e instanceof Error ? e.message : "No se pudo guardar."),
  });
  return (
    <Sheet
      open
      onClose={onClose}
      title={category ? `Editar ${category.name}` : "Nueva categoría"}
      error={error}
      footer={
        <Button
          className="flex-1"
          disabled={!name.trim()}
          busy={save.isPending}
          busyLabel="Guardando…"
          onClick={() => save.mutate()}
        >
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <TextField
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej.: Lácteos"
        />
        <SelectField label="Dentro de" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Es un rubro principal</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Ganancia por defecto (%)"
          inputMode="decimal"
          value={margin}
          onChange={(e) => setMargin(e.target.value)}
          placeholder="Ej.: 40"
          hint="Sobre el costo. Vacío: hereda la del rubro o la general."
        />
        <Toggle label="Mayores de 18" checked={adult} onChange={setAdult} />
        <Toggle label="Controla vencimientos" checked={expiry} onChange={setExpiry} />
      </div>
    </Sheet>
  );
}
