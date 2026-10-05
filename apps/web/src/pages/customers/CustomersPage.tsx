import {
  creditReceiptText,
  formatDate,
  formatMoney,
  formatTime,
  METHOD_LABEL,
  parseMoney,
  statementText,
  TERMS_LABEL,
  toDateStr,
  todayAR,
  waLink,
} from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Search, Share2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan, useGrant, useMe } from "../../app/session";
import { useRegister } from "../../cash/useRegister";
import { ApiError, api, downloadFile } from "../../data/api";
import { collectCreditLocal, saveCustomerLocal } from "../../data/customers";
import { Button } from "../../ui/Button";
import { Checkbox } from "../../ui/Checkbox";
import { Chip, FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { SelectField, TextField } from "../../ui/Field";
import { NumPad } from "../../ui/NumPad";
import { Sheet } from "../../ui/Sheet";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";
import { useWide } from "../../ui/useMedia";

type Row = {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  balanceCents: number;
  creditLimitCents: number;
  overdueCents: number;
  oldestDebtDays: number | null;
  overLimit: boolean;
  lastMovementAt: string | null;
};
type Totals = {
  inTheStreetCents: number;
  collectedThisMonthCents: number;
  overdueCents: number;
  overdueCustomers: number;
};
type Movement = {
  id: string;
  kind: string;
  label: string;
  amountCents: number;
  balanceCents: number;
  at: string;
  dueOn: string | null;
  openCents: number | null;
  reversed: boolean;
  by: string | null;
  method: string | null;
};
type Detail = Row & {
  address: string | null;
  dni: string | null;
  terms: "weekly" | "biweekly" | "30d" | "month_end";
  availableCents: number;
  movements: Movement[];
};

const FILTERS = [
  ["debt", "Con deuda"],
  ["overdue", "Vencidos"],
  ["over_limit", "Sobre el límite"],
  ["all", "Todos"],
] as const;

const money = (c: number) => (c < 0 ? `−${formatMoney(-c)}` : formatMoney(c));
const when = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return toDateStr(d) === todayAR() ? `hoy ${formatTime(d)}` : formatDate(d).slice(0, 5);
};

function statusChip(c: Row) {
  if (c.balanceCents < 0) return <Chip tone="ok">A favor</Chip>;
  if (c.overLimit) return <Chip tone="peligro">Sobre el límite</Chip>;
  if (c.overdueCents > 0) return <Chip tone="alerta">Vencido</Chip>;
  if (c.balanceCents > 0) return <Chip tone="neutro">Al día</Chip>;
  return null;
}

/** Ficha nueva o edición: nombre, apodo, teléfono, dirección, DNI, límite y plazo. */
export function CustomerForm({
  customer,
  onClose,
}: {
  customer?: Detail | null;
  onClose: (id?: string) => void;
}) {
  const me = useMe();
  const qc = useQueryClient();
  const canLimit = useGrant("credit_over_limit") === "allow";
  const [f, setF] = useState({
    name: customer?.name ?? "",
    nickname: customer?.nickname ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    dni: customer?.dni ?? "",
    limit: customer ? String(customer.creditLimitCents / 100) : "",
    terms: customer?.terms ?? "30d",
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Sin sesión");
      return saveCustomerLocal(me.member.id, customer?.id ?? null, {
        name: f.name.trim(),
        nickname: f.nickname.trim() || null,
        phone: f.phone.trim() || null,
        address: f.address.trim() || null,
        dni: f.dni.trim() || null,
        terms: f.terms as Detail["terms"],
        ...(canLimit ? { creditLimitCents: parseMoney(f.limit || "0") ?? 0 } : {}),
      });
    },
    onSuccess: async (id) => {
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["customers"] }), 800);
      setTimeout(() => void qc.invalidateQueries({ queryKey: ["customer", id] }), 800);
      onClose(id);
    },
  });
  return (
    <Sheet
      open
      onClose={() => onClose()}
      title={customer ? "Editar cliente" : "Nuevo cliente"}
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
      <div className="flex flex-col gap-3">
        <TextField
          label="Nombre"
          value={f.name}
          onChange={set("name")}
          placeholder="Rosa Giménez"
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Apodo" value={f.nickname} onChange={set("nickname")} />
          <TextField label="Teléfono" inputMode="tel" value={f.phone} onChange={set("phone")} />
        </div>
        <TextField label="Dirección" value={f.address} onChange={set("address")} />
        <TextField label="DNI (opcional)" inputMode="numeric" value={f.dni} onChange={set("dni")} />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Límite"
            inputMode="decimal"
            value={f.limit}
            onChange={set("limit")}
            disabled={!canLimit}
            hint={canLimit ? undefined : "Lo cambia un encargado o el dueño."}
          />
          <SelectField label="Plazo" value={f.terms} onChange={set("terms")}>
            {Object.entries(TERMS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
        </div>
      </div>
    </Sheet>
  );
}

/** Cobrar fiado: monto, medio (el efectivo entra a la caja del turno) y a qué deudas se aplica. */
export function CollectSheet({ customer, onClose }: { customer: Detail; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const reg = useRegister();
  const [typed, setTyped] = useState("");
  const [method, setMethod] = useState<"cash" | "transfer" | "debit">("cash");
  const [mode, setMode] = useState<"oldest" | "pick">("oldest");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [receipt, setReceipt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(typed || "0") * 100;
  const open = customer.movements.filter((m) => (m.openCents ?? 0) > 0).reverse();
  const pay = useMutation({
    mutationFn: async () => {
      if (!me) throw new Error("Sin sesión");
      if (amount <= 0) throw new Error("Tipeá cuánto paga.");
      if (method === "cash" && !reg.shift) throw new Error("Abrí la caja para cobrar en efectivo.");
      await collectCreditLocal(me.member.id, {
        customerId: customer.id,
        amountCents: amount,
        method,
        shiftId: reg.shift?.id ?? null,
        applyTo: mode === "pick" && picked.size ? [...picked] : "oldest",
      });
      return creditReceiptText({
        businessName: me.business?.name ?? "",
        customerName: customer.name,
        amountCents: amount,
        methodLabel: METHOD_LABEL[method],
        at: new Date(),
        balanceAfterCents: customer.balanceCents - amount,
      });
    },
    onSuccess: (text) => {
      setReceipt(text);
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["customers"] });
        void qc.invalidateQueries({ queryKey: ["customer", customer.id] });
      }, 1000);
    },
    onError: (e) => setError((e as Error).message),
  });
  if (receipt) {
    return (
      <Sheet open onClose={onClose} title="Pago registrado">
        <section aria-label="Recibo">
          <pre className="m-0 rounded-lg bg-neutro-suave p-4 font-sans text-sm whitespace-pre-wrap">
            {receipt}
          </pre>
        </section>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={waLink(customer.phone, receipt)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primario px-4 font-semibold text-white no-underline"
          >
            <MessageCircle size={18} aria-hidden /> Mandar por WhatsApp
          </a>
          <Button variant="secondary" onClick={onClose}>
            Listo
          </Button>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title="Cobrar fiado"
      footer={
        <Button
          className="flex-1"
          size="lg"
          disabled={!amount || pay.isPending}
          onClick={() => pay.mutate()}
        >
          Registrar pago y dar recibo
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-texto-suave">
          {customer.name} · debe {money(customer.balanceCents)}
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-borde bg-fondo p-3">
          <div>
            <div className="text-xs text-texto-suave">Paga</div>
            <output aria-label="Paga" className="tnum text-[28px] leading-tight font-semibold">
              {formatMoney(amount)}
            </output>
          </div>
          <div>
            <div className="text-xs text-texto-suave">Queda debiendo</div>
            <output
              aria-label="Queda debiendo"
              className={cx(
                "tnum text-[28px] leading-tight font-semibold",
                customer.balanceCents - amount < 0 && "text-exito",
              )}
            >
              {money(customer.balanceCents - amount)}
            </output>
          </div>
        </div>
        <NumPad
          onKey={(k) =>
            setTyped((t) =>
              k === "back"
                ? t.slice(0, -1)
                : k === ","
                  ? t
                  : (t + k).replace(/^0+/, "").slice(0, 9),
            )
          }
        />
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="Medio de pago">
          <FilterChip active={method === "cash"} onClick={() => setMethod("cash")}>
            Efectivo
          </FilterChip>
          <FilterChip active={method === "transfer"} onClick={() => setMethod("transfer")}>
            Transf. o QR
          </FilterChip>
          <FilterChip active={method === "debit"} onClick={() => setMethod("debit")}>
            Tarjeta
          </FilterChip>
        </fieldset>
        {method === "cash" && (
          <div className="text-xs text-texto-suave">
            {reg.shift
              ? `El efectivo entra a la caja del turno de ${reg.cashierName ?? "hoy"}.`
              : "La caja está cerrada: abrila para cobrar en efectivo."}
          </div>
        )}
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0" aria-label="Se aplica a">
          <FilterChip active={mode === "oldest"} onClick={() => setMode("oldest")}>
            Las más viejas primero
          </FilterChip>
          <FilterChip active={mode === "pick"} onClick={() => setMode("pick")}>
            Elegir tickets
          </FilterChip>
        </fieldset>
        {mode === "pick" && (
          <div className="flex flex-col gap-1">
            {open.map((m) => (
              <Checkbox
                key={m.id}
                label={`${formatDate(new Date(m.at)).slice(0, 5)} · ${m.label} · ${formatMoney(m.openCents ?? 0)}`}
                checked={picked.has(m.id)}
                onChange={(v) =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (v) n.add(m.id);
                    else n.delete(m.id);
                    return n;
                  })
                }
              />
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

function CustomerView({ id, onEdit }: { id: string; onEdit: (d: Detail) => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const canReverse = useGrant("credit_over_limit") === "allow";
  const [collecting, setCollecting] = useState(false);
  const q = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api<Detail>(`/api/customers/${id}`),
  });
  const reverse = useMutation({
    mutationFn: (entryId: string) =>
      api(`/api/customers/${id}/ledger/${entryId}/reverse`, {
        body: { reason: "Anulado desde la ficha" },
      }),
    onSuccess: async () => {
      toast({ text: "Movimiento anulado con un contramovimiento" });
      await qc.invalidateQueries({ queryKey: ["customer", id] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo anular.", tone: "error" }),
  });
  if (q.isPending) return <SkeletonList rows={5} className="p-4" />;
  if (q.isError)
    return <ErrorState message="La ficha se ve con conexión." onRetry={() => q.refetch()} />;
  const c = q.data;
  const open = c.movements.filter((m) => (m.openCents ?? 0) > 0).reverse();
  const share = () => {
    const text = statementText({
      businessName: me?.business?.name ?? "",
      customerName: c.name,
      asOf: todayAR(),
      balanceCents: c.balanceCents,
      overdueCents: c.overdueCents,
      open: open.map((m) => ({ date: toDateStr(new Date(m.at)), openCents: m.openCents ?? 0 })),
    });
    window.open(waLink(c.phone, text), "_blank", "noopener");
  };
  return (
    <div className="flex flex-col gap-4 p-5 text-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primario-suave font-semibold text-primario">
          {c.name
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-lg font-semibold">{c.name}</h2>
          <div className="text-texto-suave">
            {[c.phone, c.address, `plazo ${TERMS_LABEL[c.terms].toLowerCase()}`]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <Button variant="ghost" onClick={() => onEdit(c)}>
          Editar
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <section aria-label="Saldo" className="rounded-lg border border-borde px-3 py-2">
          <div className="text-xs text-texto-suave">
            {c.balanceCents < 0 ? "Saldo a favor" : "Saldo"}
          </div>
          <div
            className={cx(
              "tnum text-2xl font-semibold",
              c.balanceCents < 0 ? "text-exito" : c.overdueCents > 0 ? "text-peligro" : "",
            )}
          >
            {formatMoney(Math.abs(c.balanceCents))}
          </div>
        </section>
        <section aria-label="Límite" className="rounded-lg border border-borde px-3 py-2">
          <div className="text-xs text-texto-suave">Límite</div>
          <div className="tnum text-2xl font-semibold">{formatMoney(c.creditLimitCents)}</div>
        </section>
      </div>
      <div className="text-texto-suave">
        {c.oldestDebtDays != null ? `Deuda más vieja: ${c.oldestDebtDays} días · ` : ""}
        {c.overdueCents > 0 ? (
          <span className="font-semibold text-peligro">vencido {formatMoney(c.overdueCents)}</span>
        ) : (
          "nada vencido"
        )}
      </div>
      <div className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
        Cuenta corriente
      </div>
      {c.movements.length === 0 ? (
        <div className="text-texto-suave">Sin movimientos todavía.</div>
      ) : (
        <ul className="m-0 list-none p-0" aria-label="Movimientos">
          {c.movements.map((m) => (
            <li
              key={m.id}
              className={cx(
                "flex items-center gap-2 border-t border-borde py-2",
                m.reversed && "text-texto-apagado line-through",
              )}
            >
              <span className="tnum w-12 shrink-0 text-texto-suave">
                {formatDate(new Date(m.at)).slice(0, 5)}
              </span>
              <span className="min-w-0 flex-1">
                {m.label}
                {m.method && m.kind === "payment"
                  ? ` · ${METHOD_LABEL[m.method as keyof typeof METHOD_LABEL] ?? m.method}`
                  : ""}
                {m.openCents != null && m.openCents > 0 && m.openCents < m.amountCents ? (
                  <span className="block text-xs text-texto-suave">
                    queda {formatMoney(m.openCents)}
                  </span>
                ) : null}
              </span>
              <span className={cx("tnum font-semibold", m.amountCents < 0 && "text-exito")}>
                {m.amountCents < 0 ? `−${formatMoney(-m.amountCents)}` : formatMoney(m.amountCents)}
              </span>
              <span className="tnum w-20 text-right text-texto-suave">{money(m.balanceCents)}</span>
              {canReverse && !m.reversed && m.kind !== "reversal" && (
                <button
                  type="button"
                  className="text-xs font-semibold text-peligro"
                  onClick={() => reverse.mutate(m.id)}
                  aria-label={`Anular ${m.label} del ${formatDate(new Date(m.at)).slice(0, 5)}`}
                >
                  Anular
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" icon={<Share2 size={18} />} onClick={share}>
          Compartir estado
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void downloadFile(
              `/api/customers/${c.id}/statement.pdf`,
              `estado-de-cuenta-${c.name.toLowerCase().replace(/\s+/g, "-")}.pdf`,
            )
          }
        >
          PDF
        </Button>
        <span className="flex-1" />
        <Button onClick={() => setCollecting(true)} disabled={c.balanceCents <= 0}>
          Cobrar fiado
        </Button>
      </div>
      {collecting && <CollectSheet customer={c} onClose={() => setCollecting(false)} />}
    </div>
  );
}

/** Clientes y fiado: plata en la calle, lista con filtros y ficha con la cuenta corriente. */
export function CustomersPage() {
  const can = useCan("sell");
  const wide = useWide();
  const navigate = useNavigate();
  const { id } = useParams();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("debt");
  const [term, setTerm] = useState("");
  const [form, setForm] = useState<{ c: Detail | null } | null>(null);
  const q = useQuery({
    queryKey: ["customers", filter, term],
    queryFn: () =>
      api<{ items: Row[]; totals: Totals }>(
        `/api/customers?filter=${filter}${term ? `&q=${encodeURIComponent(term)}` : ""}`,
      ),
    enabled: can,
  });
  const counts = useQuery({
    queryKey: ["customers", "counts"],
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          FILTERS.map(
            async ([f]) =>
              [
                f,
                (await api<{ items: Row[] }>(`/api/customers?filter=${f}`)).items.length,
              ] as const,
          ),
        ),
      ),
    enabled: can,
  });
  if (!can) return <NoPermissionFor perm="sell" />;
  const t = q.data?.totals;
  const showList = wide || !id;
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      {showList && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 flex-1 text-[22px] font-semibold">Clientes y fiado</h1>
            <Button onClick={() => setForm({ c: null })}>Nuevo cliente</Button>
          </div>
          {t && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <section
                aria-label="Plata en la calle"
                className="rounded-card border border-borde bg-superficie px-4 py-3"
              >
                <div className="text-xs text-texto-suave">Plata en la calle</div>
                <div className="tnum text-2xl font-semibold">{formatMoney(t.inTheStreetCents)}</div>
              </section>
              <section
                aria-label="Vencido"
                className="rounded-card border border-borde bg-superficie px-4 py-3"
              >
                <div className="text-xs text-texto-suave">
                  Vencido · {t.overdueCustomers} clientes
                </div>
                <div
                  className={cx(
                    "tnum text-2xl font-semibold",
                    t.overdueCents > 0 && "text-peligro",
                  )}
                >
                  {formatMoney(t.overdueCents)}
                </div>
              </section>
              <section
                aria-label="Cobrado este mes"
                className="rounded-card border border-borde bg-superficie px-4 py-3"
              >
                <div className="text-xs text-texto-suave">Cobrado este mes</div>
                <div className="tnum text-2xl font-semibold">
                  {formatMoney(t.collectedThisMonthCents)}
                </div>
              </section>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map(([f, label]) => (
              <FilterChip key={f} active={filter === f} onClick={() => setFilter(f)}>
                {label}
                {counts.data ? ` · ${counts.data[f]}` : ""}
              </FilterChip>
            ))}
            <label className="ml-auto flex h-10 items-center gap-2 rounded-lg border border-borde bg-superficie px-3">
              <Search size={16} className="text-texto-suave" aria-hidden />
              <input
                aria-label="Buscar cliente"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar"
                className="w-36 bg-transparent outline-none"
              />
            </label>
          </div>
        </>
      )}
      <div className={cx("grid gap-4", wide && id ? "grid-cols-[minmax(0,1fr)_440px]" : "")}>
        {showList &&
          (q.isPending ? (
            <SkeletonList />
          ) : q.isError ? (
            <ErrorState
              message="La lista de clientes se ve con conexión. Para fiar, buscá al cliente desde Vender."
              onRetry={() => q.refetch()}
            />
          ) : !q.data.items.length ? (
            <EmptyState
              title={
                filter === "all"
                  ? "Cargá a tus clientes para fiarles y llevar su cuenta"
                  : "No hay clientes acá"
              }
              action={
                filter === "all" ? (
                  <Button onClick={() => setForm({ c: null })}>Nuevo cliente</Button>
                ) : undefined
              }
            />
          ) : (
            <ul
              className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
              aria-label="Clientes"
            >
              {q.data.items.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className={cx(
                      "flex w-full items-center gap-3 border-b border-borde px-4 py-3 text-left",
                      id === c.id && "bg-primario-suave/60",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span
                        className={cx("block font-semibold", c.overdueCents > 0 && "text-peligro")}
                      >
                        {c.name}
                      </span>
                      <span className="block truncate text-[13px] text-texto-suave">
                        {c.phone ?? "sin teléfono"}
                        {c.oldestDebtDays != null ? ` · ${c.oldestDebtDays} días` : ""} ·{" "}
                        {when(c.lastMovementAt)}
                      </span>
                    </span>
                    {wide && (
                      <span className="tnum w-24 text-right text-texto-suave">
                        {formatMoney(c.creditLimitCents)}
                      </span>
                    )}
                    <span
                      className={cx(
                        "tnum text-right font-semibold",
                        wide ? "w-24" : "text-xl",
                        c.balanceCents < 0 && "text-exito",
                      )}
                    >
                      {money(c.balanceCents)}
                    </span>
                    {wide && <span className="w-32 text-right">{statusChip(c)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          ))}
        {id && (
          <aside
            aria-label="Ficha del cliente"
            className="rounded-card border border-borde bg-superficie"
          >
            {!wide && (
              <Button variant="ghost" className="m-2" onClick={() => navigate("/clientes")}>
                ← Clientes
              </Button>
            )}
            <CustomerView key={id} id={id} onEdit={(c) => setForm({ c })} />
          </aside>
        )}
      </div>
      {form && (
        <CustomerForm
          customer={form.c}
          onClose={(newId) => {
            setForm(null);
            if (newId && !form.c) navigate(`/clientes/${newId}`);
          }}
        />
      )}
    </div>
  );
}
