import { formatDate, formatMoney, formatQty } from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Star } from "lucide-react";
import { useState } from "react";
import { useCan } from "../../app/session";
import { ApiError, api } from "../../data/api";
import { Button } from "../../ui/Button";
import { Chip, FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { SelectField, TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import {
  type SupplierLink,
  SupplierLinkSheet,
  useCanLinkSuppliers,
} from "../products/SupplierLinkSheet";
import { PurchasesTabs } from "./PurchasesTabs";

export type Supplier = {
  id: string;
  name: string;
  legalName: string | null;
  cuit: string | null;
  category: string | null;
  contactName: string | null;
  whatsapp: string | null;
  email: string | null;
  channel: "whatsapp" | "manual" | "wholesale";
  orderDays: number[] | null;
  deliveryDays: number[] | null;
  scheduleNote: string | null;
  minOrderCents: number | null;
  paymentTermsDays: number | null;
  balanceCents?: number;
  lastOrderAt: string | null;
};

type SupplierDetail = Supplier & {
  products: {
    productId: string;
    name: string;
    supplierCode: string | null;
    packQty: number | null;
    isPrimary: boolean;
    stockQty: number;
    saleUnit: "unit" | "kg" | "100g";
    costCents?: number | null;
  }[];
  orders: { id: string; number: number; status: string; totalCents?: number }[];
};

export const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const CHANNEL = {
  whatsapp: "WhatsApp",
  manual: "Manual",
  wholesale: "Compra en persona",
} as const;

export function daysLabel(d: number[] | null, note?: string | null) {
  if (note) return note;
  if (!d?.length) return "—";
  if (d.length === 7) return "Diario";
  return d.map((x) => DAYS[x]).join(", ");
}

function SupplierForm({ supplier, onClose }: { supplier?: Supplier | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: supplier?.name ?? "",
    category: supplier?.category ?? "",
    contactName: supplier?.contactName ?? "",
    whatsapp: supplier?.whatsapp ?? "",
    email: supplier?.email ?? "",
    cuit: supplier?.cuit ?? "",
    legalName: supplier?.legalName ?? "",
    channel: supplier?.channel ?? "whatsapp",
    minOrder: supplier?.minOrderCents ? String(supplier.minOrderCents / 100) : "",
    terms: supplier?.paymentTermsDays != null ? String(supplier.paymentTermsDays) : "",
  });
  const [orderDays, setOrderDays] = useState<number[]>(supplier?.orderDays ?? []);
  const [deliveryDays, setDeliveryDays] = useState<number[]>(supplier?.deliveryDays ?? []);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: f.name.trim(),
        category: f.category || null,
        contactName: f.contactName || null,
        whatsapp: f.whatsapp.replace(/[\s-]/g, "") || null,
        email: f.email || null,
        cuit: f.cuit || null,
        legalName: f.legalName || null,
        channel: f.channel,
        orderDays,
        deliveryDays,
        minOrderCents: f.minOrder ? Math.round(Number(f.minOrder.replace(/\./g, "")) * 100) : null,
        paymentTermsDays: f.terms ? Number(f.terms) : null,
      };
      return supplier
        ? api(`/api/suppliers/${supplier.id}`, { method: "PATCH", body })
        : api("/api/suppliers", { body });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      onClose();
    },
    onError: (e) =>
      setError(
        e instanceof ApiError
          ? (((e.details as { message: string }[] | undefined)?.[0]?.message ??
              e.message) as string)
          : "No se pudo guardar.",
      ),
  });
  const dayPicker = (value: number[], onChange: (v: number[]) => void, label: string) => (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-[13px] font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {DAYS.map((d, i) => (
          <FilterChip
            key={d}
            active={value.includes(i)}
            onClick={() =>
              onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())
            }
          >
            {d.slice(0, 3)}
          </FilterChip>
        ))}
      </div>
    </fieldset>
  );
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={supplier ? "Editar proveedor" : "Nuevo proveedor"}
      footer={
        <Button
          className="flex-1"
          disabled={!f.name.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          Guardar
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TextField
          label="Nombre"
          value={f.name}
          onChange={set("name")}
          placeholder="Distribuidora Andina"
        />
        <TextField
          label="Rubro"
          value={f.category}
          onChange={set("category")}
          placeholder="Bebidas y almacén"
        />
        <TextField
          label="Contacto"
          value={f.contactName}
          onChange={set("contactName")}
          placeholder="Gustavo"
        />
        <TextField
          label="WhatsApp"
          inputMode="tel"
          value={f.whatsapp}
          onChange={set("whatsapp")}
          placeholder="5492614000001"
          hint="Con código de país y área, sin el 0 ni el 15."
        />
        <TextField label="Email" type="email" value={f.email} onChange={set("email")} />
        <SelectField label="Canal" value={f.channel} onChange={set("channel")}>
          {Object.entries(CHANNEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </SelectField>
        <TextField label="Razón social" value={f.legalName} onChange={set("legalName")} />
        <TextField label="CUIT" value={f.cuit} onChange={set("cuit")} />
        <TextField
          label="Pedido mínimo"
          inputMode="decimal"
          value={f.minOrder}
          onChange={set("minOrder")}
          placeholder="150000"
        />
        <TextField
          label="Plazo de pago (días)"
          inputMode="numeric"
          value={f.terms}
          onChange={set("terms")}
          placeholder="15"
        />
        {dayPicker(orderDays, setOrderDays, "Días de pedido")}
        {dayPicker(deliveryDays, setDeliveryDays, "Días de entrega")}
        {error && (
          <div role="alert" className="text-sm font-semibold text-peligro lg:col-span-2">
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function SupplierDetailView({ id, onEdit }: { id: string; onEdit: (s: Supplier) => void }) {
  const canEdit = useCan("build_orders");
  const canLink = useCanLinkSuppliers();
  const [link, setLink] = useState<{ link: SupplierLink | null } | null>(null);
  const q = useQuery({
    queryKey: ["supplier", id],
    queryFn: () => api<SupplierDetail>(`/api/suppliers/${id}`),
  });
  if (q.isPending) return <SkeletonList rows={4} className="p-4" />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  const s = q.data;
  return (
    <div className="flex flex-col gap-3 p-5 text-sm">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="m-0 text-lg font-semibold">{s.name}</h2>
          <div className="text-texto-suave">
            {[s.category, s.contactName, CHANNEL[s.channel]].filter(Boolean).join(" · ")}
          </div>
        </div>
        {canEdit && (
          <Button variant="secondary" onClick={() => onEdit(s)}>
            Editar
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-borde px-3 py-2">
          <div className="text-xs text-texto-suave">Pedido</div>
          {daysLabel(s.orderDays, s.scheduleNote)}
        </div>
        <div className="rounded-lg border border-borde px-3 py-2">
          <div className="text-xs text-texto-suave">Entrega</div>
          {daysLabel(s.deliveryDays, s.scheduleNote)}
        </div>
        {s.minOrderCents != null && (
          <div className="rounded-lg border border-borde px-3 py-2">
            <div className="text-xs text-texto-suave">Pedido mínimo</div>
            {formatMoney(s.minOrderCents)}
          </div>
        )}
        {s.balanceCents !== undefined && (
          <div className="rounded-lg border border-borde px-3 py-2">
            <div className="text-xs text-texto-suave">A pagar</div>
            <span className="font-semibold">{formatMoney(s.balanceCents)}</span>
          </div>
        )}
      </div>
      {s.whatsapp ? (
        <a
          href={`https://wa.me/${s.whatsapp}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 font-semibold text-primario"
        >
          <MessageCircle size={18} aria-hidden /> +{s.whatsapp}
        </a>
      ) : (
        <span className="text-texto-suave">
          Sin WhatsApp: los pedidos salen en PDF o texto para copiar.
        </span>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className="flex-1 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
          Productos · {s.products.length}
        </span>
        {canLink && (
          <Button variant="secondary" onClick={() => setLink({ link: null })}>
            Agregar producto
          </Button>
        )}
      </div>
      {s.products.length === 0 && (
        <span className="text-texto-suave">
          Todavía no tiene productos. Vinculalos para armar los pedidos sugeridos.
        </span>
      )}
      <ul className="m-0 list-none p-0" aria-label="Productos del proveedor">
        {s.products.map((p) => (
          <li key={p.productId} className="flex items-center gap-2 border-t border-borde py-1.5">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                {p.name}
                {p.isPrimary && (
                  <Chip tone="primario" icon={Star}>
                    Principal
                  </Chip>
                )}
              </span>
              <span className="block text-xs text-texto-suave">
                {[
                  p.supplierCode,
                  p.packQty != null ? `bulto × ${formatQty(p.packQty)}` : null,
                  `stock ${formatQty(p.stockQty, p.saleUnit === "unit" ? "unit" : "kg")}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {p.costCents != null && <span className="tnum">{formatMoney(p.costCents)}</span>}
            {canLink && (
              <Button
                variant="ghost"
                aria-label={`Editar ${p.name}`}
                onClick={() =>
                  setLink({
                    link: {
                      ...p,
                      supplierId: s.id,
                      supplierName: s.name,
                      productName: p.name,
                    },
                  })
                }
              >
                Editar
              </Button>
            )}
          </li>
        ))}
      </ul>
      {s.orders.length > 0 && (
        <>
          <div className="mt-2 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
            Pedidos
          </div>
          {s.orders.slice(0, 5).map((o) => (
            <div key={o.id} className="flex justify-between border-t border-borde py-1.5">
              <span>Pedido {String(o.number).padStart(4, "0")}</span>
              <span className="text-texto-suave">{o.status}</span>
            </div>
          ))}
        </>
      )}
      {link && (
        <SupplierLinkSheet
          from="supplier"
          supplierId={s.id}
          link={link.link}
          onClose={() => setLink(null)}
        />
      )}
    </div>
  );
}

/** Proveedores: lista con rubro, días, WhatsApp, saldo y último pedido; ficha en panel. */
export function SuppliersPage() {
  const canEdit = useCan("build_orders");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<{ s: Supplier | null } | null>(null);
  const q = useQuery({ queryKey: ["suppliers"], queryFn: () => api<Supplier[]>("/api/suppliers") });
  const total = (q.data ?? []).reduce((s, x) => s + (x.balanceCents ?? 0), 0);
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold">Compras</h1>
        <PurchasesTabs />
      </div>
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-lg font-semibold">Proveedores</h2>
        <span className="text-texto-suave">· {q.data?.length ?? 0}</span>
        <span className="flex-1" />
        {q.data?.some((s) => s.balanceCents !== undefined) && (
          <span className="text-sm">
            A pagar <strong>{formatMoney(total)}</strong>
          </span>
        )}
        {canEdit && <Button onClick={() => setForm({ s: null })}>Nuevo</Button>}
      </div>
      {q.isPending ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data.length ? (
        <EmptyState
          title="Todavía no hay proveedores"
          body="Cargá a quién le comprás para armar pedidos."
        />
      ) : (
        <div className={cx("grid gap-4", open ? "lg:grid-cols-[minmax(0,1fr)_420px]" : "")}>
          <ul
            className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
            aria-label="Proveedores"
          >
            {q.data.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpen(s.id)}
                  className={cx(
                    "flex w-full items-center gap-3 border-b border-borde px-4 py-3 text-left",
                    open === s.id && "bg-primario-suave/60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{s.name}</span>
                    <span className="block truncate text-[13px] text-texto-suave">
                      {s.category} · pedido {daysLabel(s.orderDays, s.scheduleNote).toLowerCase()} ·
                      entrega {daysLabel(s.deliveryDays, s.scheduleNote).toLowerCase()}
                    </span>
                    <span className="block text-xs text-texto-suave">
                      {CHANNEL[s.channel]}
                      {s.lastOrderAt
                        ? ` · último: ${formatDate(new Date(s.lastOrderAt)).slice(0, 5)}`
                        : ""}
                    </span>
                  </span>
                  {s.whatsapp ? (
                    <Chip tone="ok" icon={MessageCircle}>
                      WhatsApp
                    </Chip>
                  ) : (
                    <Chip>Sin WhatsApp</Chip>
                  )}
                  {s.balanceCents !== undefined && (
                    <span
                      className={cx(
                        "tnum min-w-24 text-right font-semibold",
                        s.balanceCents ? "" : "text-texto-suave",
                      )}
                    >
                      {formatMoney(s.balanceCents)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {open && (
            <aside
              aria-label="Ficha del proveedor"
              className="rounded-card border border-borde bg-superficie"
            >
              <SupplierDetailView key={open} id={open} onEdit={(s) => setForm({ s })} />
            </aside>
          )}
        </div>
      )}
      {form && <SupplierForm supplier={form.s} onClose={() => setForm(null)} />}
    </div>
  );
}
