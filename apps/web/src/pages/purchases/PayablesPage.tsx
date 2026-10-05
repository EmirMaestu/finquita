import {
  formatDate,
  formatMoney,
  PAYABLE_KIND,
  PAYABLE_STATE,
  type PayableKind,
  type PayableState,
  parseMoney,
  todayAR,
} from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { NoPermissionFor } from "../../app/guards";
import { useGrant, useMe } from "../../app/session";
import { addCashMoveLocal } from "../../cash/local";
import { useRegister } from "../../cash/useRegister";
import { ApiError, api } from "../../data/api";
import { queuePhoto } from "../../data/files";
import { Button } from "../../ui/Button";
import { Chip, FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { SelectField, TextField } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";
import { PurchasesTabs } from "./PurchasesTabs";
import type { Supplier } from "./SuppliersPage";

type Item = {
  id: string;
  supplierId: string;
  supplierName: string;
  kind: PayableKind;
  number: string | null;
  issuedOn: string;
  dueOn: string | null;
  amountCents: number;
  paidCents: number;
  pendingCents: number;
  state: PayableState;
};
type Summary = {
  dueThisWeekCents: number;
  overdueCents: number;
  creditNotesCents: number;
  totalCents: number;
  bySupplier: { supplierId: string; name: string; cents: number }[];
};

const short = (d: string | null) => (d ? formatDate(d).slice(0, 5) : "—");

function PhotoButton({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (id: string) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange(await queuePhoto(f));
        }}
      />
      <Button variant="secondary" icon={<Camera size={18} />} onClick={() => ref.current?.click()}>
        {value ? `${label} ✓` : label}
      </Button>
    </>
  );
}

function PaySheet({
  item,
  credits,
  onClose,
}: {
  item: Item;
  credits: Item[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const me = useMe();
  const reg = useRegister();
  const [method, setMethod] = useState<"transfer" | "cash" | "other">("transfer");
  const [amount, setAmount] = useState(String(item.pendingCents / 100).replace(".", ","));
  const [note, setNote] = useState("");
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cents = parseMoney(amount) ?? 0;
  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["payables"] });
    await qc.invalidateQueries({ queryKey: ["suppliers"] });
    onClose();
  };
  const pay = useMutation({
    mutationFn: async () => {
      if (cents <= 0 || cents > item.pendingCents)
        throw new Error("El monto tiene que ser mayor a cero y no pasarse de lo que falta.");
      if (method === "cash") {
        if (!reg.shift || !me)
          throw new Error("Para pagar en efectivo, abrí la caja en este dispositivo.");
        await addCashMoveLocal(me.member.id, {
          shiftId: reg.shift.id,
          kind: "supplier_payment",
          amountCents: cents,
          reason: `Pago a ${item.supplierName}`,
          invoiceId: item.id,
          note: note || null,
        });
        return;
      }
      await api(`/api/payables/${item.id}/pay`, {
        body: { method, amountCents: cents, note: note || null, photoId },
      });
    },
    onSuccess: async () => {
      toast({ text: method === "cash" ? "Pago registrado: salió de la caja" : "Pago registrado" });
      await done();
    },
    onError: (e) =>
      setError(e instanceof ApiError || e instanceof Error ? e.message : "No se pudo registrar."),
  });
  const apply = useMutation({
    mutationFn: (creditNoteId: string) =>
      api(`/api/payables/${item.id}/apply-credit`, { body: { creditNoteId } }),
    onSuccess: async () => {
      toast({ text: "Nota de crédito aplicada" });
      await done();
    },
  });
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Registrar pago · ${item.supplierName} · ${formatMoney(item.pendingCents)}`}
      footer={
        <Button className="flex-1" disabled={pay.isPending} onClick={() => pay.mutate()}>
          Registrar pago
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={method === "transfer"} onClick={() => setMethod("transfer")}>
            Transferencia
          </FilterChip>
          <FilterChip active={method === "cash"} onClick={() => setMethod("cash")}>
            Efectivo de {reg.registerName || "la caja"}
          </FilterChip>
          <FilterChip active={method === "other"} onClick={() => setMethod("other")}>
            Otro
          </FilterChip>
        </div>
        {method === "cash" && !reg.shift && (
          <div className="rounded-lg bg-alerta-suave px-3 py-2 text-sm">
            La caja de este dispositivo está cerrada: abrila para pagar en efectivo.
          </div>
        )}
        <TextField
          label="Monto"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField
          label="Nota"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Banco, número de operación…"
        />
        {method !== "cash" && (
          <PhotoButton value={photoId} onChange={setPhotoId} label="Comprobante" />
        )}
        {credits.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-borde p-3 text-sm">
            <span className="font-semibold">Notas de crédito a favor</span>
            {credits.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className="flex-1">
                  {c.number ?? "Sin número"} · {formatMoney(-c.pendingCents)}
                </span>
                <Button variant="secondary" onClick={() => apply.mutate(c.id)}>
                  Aplicar
                </Button>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div role="alert" className="text-sm font-semibold text-peligro">
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function NewPayable({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api<Supplier[]>("/api/suppliers"),
  });
  const [f, setF] = useState({
    supplierId: "",
    kind: "invoice" as PayableKind,
    number: "",
    issuedOn: todayAR(),
    dueOn: "",
    amount: "",
  });
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () =>
      api("/api/payables", {
        body: {
          supplierId: f.supplierId,
          kind: f.kind,
          number: f.number || null,
          issuedOn: f.issuedOn,
          dueOn: f.dueOn || null,
          amountCents: parseMoney(f.amount) ?? 0,
          photoId,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payables"] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "No se pudo guardar."),
  });
  return (
    <Sheet
      open
      onClose={onClose}
      title="Cargar comprobante"
      footer={
        <Button
          className="flex-1"
          disabled={!f.supplierId || !(parseMoney(f.amount) ?? 0) || save.isPending}
          onClick={() => save.mutate()}
        >
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <SelectField label="Proveedor" value={f.supplierId} onChange={set("supplierId")}>
          <option value="">Elegí</option>
          {(suppliers.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </SelectField>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PAYABLE_KIND) as PayableKind[]).map((k) => (
            <FilterChip
              key={k}
              active={f.kind === k}
              onClick={() => setF((x) => ({ ...x, kind: k }))}
            >
              {PAYABLE_KIND[k]}
            </FilterChip>
          ))}
        </div>
        <TextField
          label="Número"
          value={f.number}
          onChange={set("number")}
          placeholder="A-0003-00012345"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Fecha" type="date" value={f.issuedOn} onChange={set("issuedOn")} />
          {f.kind !== "credit_note" && (
            <TextField label="Vence" type="date" value={f.dueOn} onChange={set("dueOn")} />
          )}
        </div>
        <TextField label="Monto" inputMode="decimal" value={f.amount} onChange={set("amount")} />
        <PhotoButton value={photoId} onChange={setPhotoId} label="Foto del comprobante" />
        {error && (
          <div role="alert" className="text-sm font-semibold text-peligro">
            {error}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Facturas y pagos: agenda de vencimientos, saldo por proveedor y pagos. */
export function PayablesPage() {
  const can = useGrant("view_costs") === "allow";
  const [view, setView] = useState<"pending" | "paid">("pending");
  const [paying, setPaying] = useState<Item | null>(null);
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ["payables", view],
    queryFn: () => api<{ items: Item[]; summary: Summary }>(`/api/payables?view=${view}`),
    enabled: can,
  });
  if (!can) return <NoPermissionFor perm="view_costs" />;
  const s = q.data?.summary;
  const credits = (q.data?.items ?? []).filter(
    (i) => i.kind === "credit_note" && i.pendingCents < 0,
  );
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 text-[22px] font-semibold">Compras</h1>
        <PurchasesTabs />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 flex-1 text-lg font-semibold">Facturas y pagos</h2>
        <FilterChip active={view === "pending"} onClick={() => setView("pending")}>
          Pendientes
        </FilterChip>
        <FilterChip active={view === "paid"} onClick={() => setView("paid")}>
          Pagadas
        </FilterChip>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          Cargar comprobante
        </Button>
      </div>
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ["A pagar", s.totalCents, ""],
              ["Vence esta semana", s.dueThisWeekCents, ""],
              ["Vencido", s.overdueCents, s.overdueCents ? "text-peligro" : ""],
              ["Notas de crédito", s.creditNotesCents, ""],
            ] as const
          ).map(([label, cents, cls]) => (
            <section
              key={label}
              aria-label={label}
              className="rounded-card border border-borde bg-superficie px-4 py-3"
            >
              <div className="text-xs text-texto-suave">{label}</div>
              <div className={cx("tnum text-xl font-semibold", cls)}>{formatMoney(cents)}</div>
            </section>
          ))}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {q.isPending ? (
          <SkeletonList />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data.items.length ? (
          <EmptyState
            title={view === "pending" ? "No hay nada para pagar" : "Todavía no hay pagos"}
          />
        ) : (
          <ul
            className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
            aria-label="Comprobantes"
          >
            {q.data.items.map((i) => (
              <li
                key={i.id}
                className="flex items-start gap-3 border-b border-borde px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{i.supplierName}</span>
                  <span className="block truncate text-[13px] text-texto-suave">
                    {PAYABLE_KIND[i.kind]} {i.number ?? ""} · {short(i.issuedOn)}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-texto-suave">
                    {i.kind !== "credit_note" && `Vence ${short(i.dueOn)}`}
                    <Chip tone={PAYABLE_STATE[i.state].tone}>{PAYABLE_STATE[i.state].label}</Chip>
                  </span>
                </span>
                <span className="flex flex-col items-end gap-2">
                  <span className="tnum font-semibold">
                    {formatMoney(view === "paid" ? i.amountCents : i.pendingCents)}
                  </span>
                  {view === "pending" && i.kind !== "credit_note" && (
                    <Button variant="secondary" onClick={() => setPaying(i)}>
                      Registrar pago
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {s && s.bySupplier.length > 0 && (
          <aside
            aria-label="Saldo por proveedor"
            className="h-fit rounded-card border border-borde bg-superficie p-4 text-sm"
          >
            <div className="mb-2 text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
              Saldo por proveedor
            </div>
            {s.bySupplier.map((b) => (
              <div key={b.supplierId} className="flex justify-between border-t border-borde py-1.5">
                <span>{b.name}</span>
                <span className="tnum font-semibold">{formatMoney(b.cents)}</span>
              </div>
            ))}
          </aside>
        )}
      </div>
      {paying && (
        <PaySheet
          item={paying}
          credits={credits.filter((c) => c.supplierId === paying.supplierId)}
          onClose={() => setPaying(null)}
        />
      )}
      {creating && <NewPayable onClose={() => setCreating(false)} />}
    </div>
  );
}
