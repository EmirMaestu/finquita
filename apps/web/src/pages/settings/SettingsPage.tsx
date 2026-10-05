import {
  ALERT_KINDS,
  ALERT_LABEL,
  ALL_PERMISSIONS,
  type AlertKindCode,
  formatDate,
  formatTime,
  METHOD_LABEL,
  PERMISSIONS,
  type Permission,
  parseMoney,
  type Role,
  type SettingsMap,
} from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, FileText, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useCan } from "../../app/session";
import { ApiError, api, downloadFile } from "../../data/api";
import { useScanner } from "../../scan/useScanner";
import { syncEngine } from "../../sync";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { SelectField, TextField, Toggle } from "../../ui/Field";
import { ErrorState, SkeletonList } from "../../ui/States";
import { toast } from "../../ui/toast";
import { useWide } from "../../ui/useMedia";

const SECTIONS = [
  ["negocio", "Negocio", "Nombre, dirección, CUIT, condición fiscal y horario"],
  ["usuarios", "Usuarios", "Invitar, rol, PIN, permisos finos y desactivar"],
  ["cajas", "Cajas", "Puestos de cobro, fondo, tolerancia, conteo ciego y billetes"],
  ["medios", "Medios de pago", "Activar, recargos, alias y CVU, QR y comisiones"],
  ["precios", "Precios y stock", "Redondeo, ganancia, descuentos y vender sin stock"],
  ["dispositivos", "Dispositivos", "Prueba de la pistola, impresora, planilla de códigos"],
  ["tickets", "Tickets", "Encabezado, pie, impresión automática y copias"],
  ["whatsapp", "WhatsApp", "Fase 2: el bot. Hoy, pedidos con enlace"],
  ["avisos", "Avisos", "Qué aviso le llega a cada rol, en la app y por push"],
  ["facturacion", "Facturación electrónica", "Próximamente"],
  ["datos", "Datos", "Importar, exportar y copias de seguridad"],
  ["actividad", "Actividad", "Quién cambió qué y cuándo"],
  ["funciones", "Funciones", "Modo simple: prendé lo que necesites"],
] as const;
type SectionId = (typeof SECTIONS)[number][0];

const ROLE_LABEL: Record<Role, string> = {
  owner: "Dueño",
  manager: "Encargado",
  cashier: "Cajero",
  stocker: "Repositor",
};
const pctText = (bp: number) => String(bp / 100).replace(".", ",");
const pctBp = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);

function useSettingsServer() {
  return useQuery({
    queryKey: ["settings-server"],
    queryFn: () => api<SettingsMap>("/api/settings"),
  });
}

function useSave<K extends keyof SettingsMap>(key: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: unknown) =>
      api<SettingsMap[K]>(`/api/settings/${key}`, { method: "PUT", body: patch }),
    onSuccess: async () => {
      toast({ text: "Guardado" });
      await qc.invalidateQueries({ queryKey: ["settings-server"] });
      // Que la copia local (lo que usan Vender y la Caja) se entere enseguida.
      void syncEngine().kick();
    },
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo guardar.", tone: "error" }),
  });
}

function Card({
  title,
  children,
  footer,
}: {
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-card border border-borde bg-superficie p-4"
    >
      {title && <h3 className="m-0 text-base font-semibold">{title}</h3>}
      {children}
      {footer && <div className="flex flex-wrap gap-2 pt-1">{footer}</div>}
    </section>
  );
}

// ── Negocio ─────────────────────────────────────────────────────────────────

type Business = {
  name: string;
  address: string | null;
  city: string | null;
  cuit: string | null;
  taxCondition: "monotributo" | "responsable_inscripto" | null;
  hours: string | null;
};

function BusinessSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["business"], queryFn: () => api<Business>("/api/business") });
  const [f, setF] = useState<Business | null>(null);
  useEffect(() => {
    if (q.data && !f) setF(q.data);
  }, [q.data, f]);
  const save = useMutation({
    mutationFn: () =>
      api("/api/business", { method: "PATCH", body: { ...f, cuit: f?.cuit || null } }),
    onSuccess: async () => {
      toast({ text: "Guardado" });
      await qc.invalidateQueries({ queryKey: ["business"] });
    },
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo guardar.", tone: "error" }),
  });
  if (!f) return <SkeletonList rows={4} />;
  const set = (k: keyof Business) => (e: { target: { value: string } }) =>
    setF((x) => (x ? { ...x, [k]: e.target.value || null } : x));
  return (
    <Card footer={<Button onClick={() => save.mutate()}>Guardar</Button>}>
      <TextField label="Nombre" value={f.name} onChange={set("name")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Dirección" value={f.address ?? ""} onChange={set("address")} />
        <TextField label="Localidad" value={f.city ?? ""} onChange={set("city")} />
        <TextField
          label="CUIT"
          value={f.cuit ?? ""}
          onChange={set("cuit")}
          placeholder="20-12345678-9"
        />
        <SelectField
          label="Condición fiscal"
          value={f.taxCondition ?? ""}
          onChange={set("taxCondition")}
        >
          <option value="">Sin cargar</option>
          <option value="monotributo">Monotributo</option>
          <option value="responsable_inscripto">Responsable inscripto</option>
        </SelectField>
      </div>
      <TextField
        label="Horario"
        value={f.hours ?? ""}
        onChange={set("hours")}
        placeholder="Lunes a sábado de 8 a 13 y de 17 a 22"
      />
    </Card>
  );
}

// ── Usuarios ────────────────────────────────────────────────────────────────

type Member = {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  phone: string | null;
  active: boolean;
  hasPin: boolean;
  hasAccount: boolean;
  overrides: Partial<Record<Permission, "allow" | "deny" | "pin">>;
};

function UsersSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["members"], queryFn: () => api<Member[]>("/api/members") });
  const [f, setF] = useState({ name: "", role: "cashier" as Role, email: "", phone: "", pin: "" });
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["members"] });
  const invite = useMutation({
    mutationFn: () =>
      api("/api/members", {
        body: {
          name: f.name.trim(),
          role: f.role,
          email: f.email || null,
          phone: f.phone || null,
          ...(f.pin ? { pin: f.pin } : {}),
        },
      }),
    onSuccess: async () => {
      toast({
        text:
          f.email && (f.role === "manager" || f.role === "owner")
            ? "Listo: que cree su cuenta con ese email desde el ingreso"
            : "Listo: ya puede entrar con su PIN",
      });
      setF({ name: "", role: "cashier", email: "", phone: "", pin: "" });
      await refresh();
    },
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo invitar.", tone: "error" }),
  });
  const patch = useMutation({
    mutationFn: (a: { id: string; body: object }) =>
      api(`/api/members/${a.id}`, { method: "PATCH", body: a.body }),
    onSuccess: refresh,
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo guardar.", tone: "error" }),
  });
  const perms = useMutation({
    mutationFn: (a: { id: string; body: object }) =>
      api(`/api/members/${a.id}/permissions`, { method: "PUT", body: a.body }),
    onSuccess: refresh,
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo guardar.", tone: "error" }),
  });
  const pin = useMutation({
    mutationFn: (a: { id: string; pin: string }) =>
      api(`/api/members/${a.id}/pin`, { method: "PUT", body: { pin: a.pin } }),
    onSuccess: () => toast({ text: "PIN cambiado" }),
    onError: (e) =>
      toast({ text: e instanceof ApiError ? e.message : "No se pudo cambiar.", tone: "error" }),
  });
  return (
    <div className="flex flex-col gap-4">
      <Card title="Equipo">
        {q.isPending ? (
          <SkeletonList rows={4} />
        ) : (
          <ul className="m-0 list-none p-0">
            {(q.data ?? []).map((m) => (
              <li key={m.id} className="border-t border-borde py-2 first:border-t-0">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() => setOpen(open === m.id ? null : m.id)}
                >
                  <span className={cx("flex-1", !m.active && "text-texto-apagado line-through")}>
                    <span className="font-semibold">{m.name}</span>
                    <span className="block text-xs text-texto-suave">
                      {[m.email, m.phone].filter(Boolean).join(" · ") || "Sin email ni teléfono"}
                    </span>
                  </span>
                  <Chip>{ROLE_LABEL[m.role]}</Chip>
                  {!m.hasPin && <Chip tone="alerta">Sin PIN</Chip>}
                  <ChevronRight size={16} className="text-texto-suave" aria-hidden />
                </button>
                {open === m.id && (
                  <div className="mt-3 flex flex-col gap-3 rounded-lg bg-fondo p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <SelectField
                        label="Rol"
                        value={m.role}
                        onChange={(e) => patch.mutate({ id: m.id, body: { role: e.target.value } })}
                      >
                        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </SelectField>
                      <PinField onSave={(p) => pin.mutate({ id: m.id, pin: p })} />
                    </div>
                    <div className="text-xs font-semibold tracking-[.06em] text-texto-suave uppercase">
                      Permisos finos
                    </div>
                    {ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].optional?.includes(m.role)).map(
                      (p) => {
                        const base = PERMISSIONS[p].grants[m.role];
                        const value = m.overrides[p] ?? base;
                        return (
                          <Toggle
                            key={p}
                            label={PERMISSIONS[p].label}
                            hint={`Por el rol: ${base === "allow" ? "sí" : base === "pin" ? "con PIN" : "no"}`}
                            checked={value === "allow"}
                            onChange={(v) =>
                              perms.mutate({
                                id: m.id,
                                body: {
                                  [p]: v === (base === "allow") ? null : v ? "allow" : "deny",
                                },
                              })
                            }
                          />
                        );
                      },
                    )}
                    {!ALL_PERMISSIONS.some((p) => PERMISSIONS[p].optional?.includes(m.role)) && (
                      <div className="text-sm text-texto-suave">
                        Este rol no tiene permisos opcionales.
                      </div>
                    )}
                    <Button
                      variant={m.active ? "danger" : "secondary"}
                      className="self-start"
                      onClick={() => patch.mutate({ id: m.id, body: { active: !m.active } })}
                    >
                      {m.active ? "Desactivar" : "Volver a activar"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card
        title="Invitar"
        footer={
          <Button disabled={!f.name.trim() || invite.isPending} onClick={() => invite.mutate()}>
            Invitar
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Nombre"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
          <SelectField
            label="Rol"
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value as Role })}
          >
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Email"
            type="email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
            hint="El encargado entra con su email: crea su cuenta desde el ingreso."
          />
          <TextField
            label="Teléfono"
            inputMode="tel"
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
          <TextField
            label="PIN"
            inputMode="numeric"
            value={f.pin}
            onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 6) })}
            hint="De 4 a 6 números, para entrar en la Mac del mostrador."
          />
        </div>
      </Card>
    </div>
  );
}

function PinField({ onSave }: { onSave: (pin: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="flex items-end gap-2">
      <TextField
        label="PIN nuevo"
        inputMode="numeric"
        value={v}
        onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="flex-1"
      />
      <Button
        variant="secondary"
        disabled={v.length < 4}
        onClick={() => {
          onSave(v);
          setV("");
        }}
      >
        Cambiar
      </Button>
    </div>
  );
}

// ── Cajas ───────────────────────────────────────────────────────────────────

type Register = {
  id: string;
  name: string;
  number: number;
  suggestedFloatCents: number;
  toleranceCents: number;
  active: boolean;
};

function RegistersSection({ s }: { s: SettingsMap }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["registers"], queryFn: () => api<Register[]>("/api/registers") });
  const save = useSave("cash");
  const [denoms, setDenoms] = useState(s.cash.denominations.join(", "));
  const upd = useMutation({
    mutationFn: (a: { id: string; body: object }) =>
      api(`/api/registers/${a.id}`, { method: "PATCH", body: a.body }),
    onSuccess: async () => {
      toast({ text: "Guardado" });
      await qc.invalidateQueries({ queryKey: ["registers"] });
    },
  });
  const add = useMutation({
    mutationFn: () =>
      api("/api/registers", { body: { name: `Caja ${(q.data?.length ?? 0) + 1}` } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["registers"] }),
  });
  return (
    <div className="flex flex-col gap-4">
      {(q.data ?? []).map((r) => (
        <Card key={r.id} title={r.name}>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Nombre"
              defaultValue={r.name}
              onBlur={(e) =>
                e.target.value !== r.name &&
                upd.mutate({ id: r.id, body: { name: e.target.value } })
              }
            />
            <TextField
              label="Fondo sugerido"
              inputMode="decimal"
              defaultValue={String(r.suggestedFloatCents / 100)}
              onBlur={(e) =>
                upd.mutate({
                  id: r.id,
                  body: { suggestedFloatCents: parseMoney(e.target.value) ?? 0 },
                })
              }
            />
            <TextField
              label="Tolerancia de diferencia"
              inputMode="decimal"
              defaultValue={String(r.toleranceCents / 100)}
              onBlur={(e) =>
                upd.mutate({ id: r.id, body: { toleranceCents: parseMoney(e.target.value) ?? 0 } })
              }
              hint="Más que esto, pide comentario y avisa al dueño."
            />
          </div>
        </Card>
      ))}
      {s.features.multiRegister ? (
        <Button variant="secondary" className="self-start" onClick={() => add.mutate()}>
          Agregar caja
        </Button>
      ) : (
        <p className="m-0 text-sm text-texto-suave">
          Para tener más de una caja, prendé "Varias cajas" en Funciones.
        </p>
      )}
      <Card
        title="Arqueo"
        footer={
          <Button
            onClick={() =>
              save.mutate({
                denominations: denoms
                  .split(/[,\s]+/)
                  .map(Number)
                  .filter((n) => n > 0),
              })
            }
          >
            Guardar billetes
          </Button>
        }
      >
        <Toggle
          label="Conteo ciego"
          hint="Al cerrar, se cuenta sin ver el esperado."
          checked={s.cash.blindCount}
          onChange={(v) => save.mutate({ blindCount: v })}
        />
        <TextField
          label="Billetes y monedas que se cuentan (en pesos)"
          value={denoms}
          onChange={(e) => setDenoms(e.target.value)}
        />
      </Card>
    </div>
  );
}

// ── Medios de pago ──────────────────────────────────────────────────────────

function PaymentsSection({ s }: { s: SettingsMap }) {
  const save = useSave("payments");
  const [alias, setAlias] = useState(s.payments.alias);
  const [cvu, setCvu] = useState(s.payments.cvu);
  const fileRef = useRef<HTMLInputElement>(null);
  const methods = Object.keys(s.payments.methods) as (keyof SettingsMap["payments"]["methods"])[];
  return (
    <div className="flex flex-col gap-4">
      {methods.map((m) => {
        const cfg = s.payments.methods[m];
        const label = m === "account" ? "Fiado" : METHOD_LABEL[m];
        return (
          <Card key={m} title={label}>
            <Toggle
              label={`Aceptar ${label.toLowerCase()}`}
              checked={cfg.enabled}
              onChange={(v) => save.mutate({ methods: { [m]: { enabled: v } } })}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label={`Recargo ${label} (%)`}
                inputMode="decimal"
                defaultValue={pctText(cfg.surchargeBp)}
                onBlur={(e) =>
                  pctBp(e.target.value) !== cfg.surchargeBp &&
                  save.mutate({ methods: { [m]: { surchargeBp: pctBp(e.target.value) } } })
                }
                hint="Negativo para descuento."
              />
              <TextField
                label={`Comisión ${label} (%)`}
                inputMode="decimal"
                defaultValue={pctText(cfg.feeBp)}
                onBlur={(e) =>
                  pctBp(e.target.value) !== cfg.feeBp &&
                  save.mutate({ methods: { [m]: { feeBp: pctBp(e.target.value) } } })
                }
                hint="Para rentabilidad y resultado."
              />
            </div>
          </Card>
        );
      })}
      <Card
        title="Transferencia y QR"
        footer={
          <Button onClick={() => save.mutate({ alias: alias.trim(), cvu: cvu.trim() })}>
            Guardar
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Alias" value={alias} onChange={(e) => setAlias(e.target.value)} />
          <TextField
            label="CVU"
            inputMode="numeric"
            value={cvu}
            onChange={(e) => setCvu(e.target.value.replace(/\D/g, "").slice(0, 22))}
          />
        </div>
        <div className="flex items-center gap-3">
          {s.payments.qrImage ? (
            <img
              src={s.payments.qrImage}
              alt="QR del local"
              className="size-20 rounded-lg border border-borde"
            />
          ) : (
            <span className="text-sm text-texto-suave">Sin imagen del QR</span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label="Imagen del QR"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = new FileReader();
              r.onload = () => save.mutate({ qrImage: String(r.result) });
              r.readAsDataURL(f);
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Subir imagen del QR
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ── Precios y stock ─────────────────────────────────────────────────────────

function PricingSection({ s }: { s: SettingsMap }) {
  const save = useSave("pricing");
  const p = s.pricing;
  const blurPct =
    (k: "defaultMarginBp" | "minMarginBp" | "discountCapBp") =>
    (e: { target: { value: string } }) =>
      pctBp(e.target.value) !== p[k] && save.mutate({ [k]: pctBp(e.target.value) });
  return (
    <Card>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Redondeo del precio"
          value={String(p.roundingCents)}
          onChange={(e) => save.mutate({ roundingCents: Number(e.target.value) })}
        >
          <option value="100">A $ 1</option>
          <option value="1000">A $ 10</option>
          <option value="5000">A $ 50</option>
          <option value="10000">A $ 100</option>
        </SelectField>
        <TextField
          label="Ganancia por defecto (%)"
          inputMode="decimal"
          defaultValue={pctText(p.defaultMarginBp)}
          onBlur={blurPct("defaultMarginBp")}
          hint="Cada categoría puede tener la suya."
        />
        <TextField
          label="Ganancia mínima de alerta (%)"
          inputMode="decimal"
          defaultValue={pctText(p.minMarginBp)}
          onBlur={blurPct("minMarginBp")}
        />
        <TextField
          label="Tope de descuento sin PIN (%)"
          inputMode="decimal"
          defaultValue={pctText(p.discountCapBp)}
          onBlur={blurPct("discountCapBp")}
        />
        <SelectField
          label="Vender sin stock"
          value={p.sellWithoutStock}
          onChange={(e) => save.mutate({ sellWithoutStock: e.target.value })}
        >
          <option value="warn">Con aviso</option>
          <option value="pin">Con PIN</option>
        </SelectField>
        <TextField
          label="Días de reserva del pedido sugerido"
          inputMode="numeric"
          defaultValue={String(p.reserveDays)}
          onBlur={(e) =>
            Number(e.target.value) !== p.reserveDays &&
            save.mutate({ reserveDays: Number(e.target.value) || 0 })
          }
        />
      </div>
    </Card>
  );
}

// ── Dispositivos y tickets ───────────────────────────────────────────────────

type Device = {
  id: string;
  name: string;
  kind: string;
  enabledAt: string | null;
  revokedAt: string | null;
  lastSeenAt: string | null;
};

function DevicesSection() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["devices"], queryFn: () => api<Device[]>("/api/devices") });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/devices/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["devices"] }),
  });
  const [last, setLast] = useState<string | null>(null);
  useScanner({ onScan: (c) => setLast(c) });
  return (
    <div className="flex flex-col gap-4">
      <Card title="Prueba de la pistola">
        <p className="m-0 text-sm">
          Escaneá cualquier código con la pistola: tiene que aparecer acá abajo, entero.
        </p>
        <output
          aria-label="Último código leído"
          className="tnum rounded-lg bg-fondo px-4 py-3 text-xl font-semibold"
        >
          {last ?? "Esperando un código…"}
        </output>
      </Card>
      <Card title="Dispositivos habilitados">
        {(q.data ?? []).map((d) => (
          <div
            key={d.id}
            className="flex items-center gap-3 border-t border-borde py-2 text-sm first:border-t-0"
          >
            <span className={cx("flex-1", d.revokedAt && "text-texto-apagado line-through")}>
              {d.name}
              <span className="block text-xs text-texto-suave">
                {d.lastSeenAt
                  ? `Visto ${formatDate(new Date(d.lastSeenAt))} ${formatTime(new Date(d.lastSeenAt))}`
                  : "Sin uso todavía"}
              </span>
            </span>
            {!d.revokedAt && (
              <Button variant="ghost" onClick={() => revoke.mutate(d.id)}>
                Revocar
              </Button>
            )}
          </div>
        ))}
        {q.isError && (
          <div className="text-sm text-texto-suave">
            Para ver los dispositivos, entrá con tu cuenta de dueño.
          </div>
        )}
      </Card>
      <Card
        title="Etiquetas y códigos"
        footer={
          <>
            <Button variant="secondary" onClick={() => navigate("/productos/planilla")}>
              Planilla de códigos
            </Button>
            <Button variant="secondary" onClick={() => navigate("/productos/etiquetas")}>
              Etiquetas de góndola
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm text-texto-suave">
          La balanza conectada llega más adelante: hoy los pesables se venden con su botón y el
          teclado de peso.
        </p>
      </Card>
    </div>
  );
}

function TicketsSection({ s }: { s: SettingsMap }) {
  const save = useSave("tickets");
  const t = s.tickets;
  const [header, setHeader] = useState(t.header);
  const [footer, setFooter] = useState(t.footer);
  return (
    <Card footer={<Button onClick={() => save.mutate({ header, footer })}>Guardar textos</Button>}>
      <Toggle
        label="Hay impresora de tickets"
        checked={t.printer}
        onChange={(v) => save.mutate({ printer: v })}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Ancho del papel"
          value={String(t.width)}
          onChange={(e) => save.mutate({ width: Number(e.target.value) })}
        >
          <option value="58">58 mm</option>
          <option value="80">80 mm</option>
        </SelectField>
        <SelectField
          label="Copias"
          value={String(t.copies)}
          onChange={(e) => save.mutate({ copies: Number(e.target.value) })}
        >
          {[1, 2, 3].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </SelectField>
      </div>
      <Toggle
        label="Imprimir solo al cobrar"
        checked={t.autoPrint}
        onChange={(v) => save.mutate({ autoPrint: v })}
      />
      <TextField label="Encabezado" value={header} onChange={(e) => setHeader(e.target.value)} />
      <TextField
        label="Pie"
        value={footer}
        onChange={(e) => setFooter(e.target.value)}
        placeholder="¡Gracias por tu compra!"
      />
    </Card>
  );
}

// ── Avisos ──────────────────────────────────────────────────────────────────

function AlertsSection({ s }: { s: SettingsMap }) {
  const save = useSave("alerts");
  const roles = Object.keys(ROLE_LABEL) as Role[];
  const toggle = (k: AlertKindCode, ch: "app" | "push", r: Role, on: boolean) => {
    const row = s.alerts[k];
    const next = on ? [...new Set([...row[ch], r])] : row[ch].filter((x) => x !== r);
    save.mutate({ [k]: { ...row, [ch]: next } });
  };
  return (
    <section
      aria-label="Matriz de avisos"
      className="overflow-x-auto rounded-card border border-borde bg-superficie"
    >
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs text-texto-suave">
            <th className="px-4 py-2">Aviso</th>
            {roles.map((r) => (
              <th key={r} className="px-2 py-2 text-center">
                {ROLE_LABEL[r]}
                <span className="block font-normal">app · push</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ALERT_KINDS.map((k) => (
            <tr key={k} className="border-t border-borde">
              <td className="px-4 py-2">{ALERT_LABEL[k]}</td>
              {roles.map((r) => (
                <td key={r} className="px-2 text-center whitespace-nowrap">
                  <input
                    type="checkbox"
                    aria-label={`${ALERT_LABEL[k]}: ${ROLE_LABEL[r]} en la app`}
                    checked={s.alerts[k].app.includes(r)}
                    onChange={(e) => toggle(k, "app", r, e.target.checked)}
                    className="size-4"
                  />{" "}
                  <input
                    type="checkbox"
                    aria-label={`${ALERT_LABEL[k]}: ${ROLE_LABEL[r]} por push`}
                    checked={s.alerts[k].push.includes(r)}
                    onChange={(e) => toggle(k, "push", r, e.target.checked)}
                    className="size-4"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 px-4 py-3 text-xs text-texto-suave">
        WhatsApp como canal se suma en la fase 2, con el bot.
      </p>
    </section>
  );
}

// ── Facturación, WhatsApp, datos, actividad y funciones ──────────────────────

function InvoicingSection({ s }: { s: SettingsMap }) {
  const save = useSave("invoicing");
  return (
    <Card title="Próximamente">
      <p className="m-0 text-sm">
        Desde el cobro vas a poder emitir factura A, B o C con CAE de ARCA, sin salir de Mostrador.
      </p>
      <div className="text-sm">
        <div className="font-semibold">Lo que vas a necesitar</div>
        <ul className="m-0 mt-1 pl-5 text-texto-suave">
          <li>Tu CUIT y la condición fiscal (ya los podés cargar en Negocio).</li>
          <li>El certificado digital de ARCA para facturar por web service.</li>
          <li>Un punto de venta habilitado para web service.</li>
        </ul>
      </div>
      <p className="m-0 text-xs text-texto-suave">
        El IVA de cada producto ya se carga hoy, así no hay que migrar nada.
      </p>
      {s.invoicing.notifyWhenReady ? (
        <Chip tone="ok">Te avisamos cuando esté</Chip>
      ) : (
        <Button className="self-start" onClick={() => save.mutate({ notifyWhenReady: true })}>
          Avisame cuando esté
        </Button>
      )}
    </Card>
  );
}

function WhatsappSection() {
  const navigate = useNavigate();
  return (
    <Card
      title="Fase 2"
      footer={
        <Button variant="secondary" onClick={() => navigate("/compras/proveedores")}>
          Ir a Proveedores
        </Button>
      }
    >
      <p className="m-0 text-sm">
        El bot que manda los pedidos y responde consultas llega en la fase 2.
      </p>
      <p className="m-0 text-sm text-texto-suave">
        Hoy, el WhatsApp de cada proveedor se carga en su ficha y el pedido sale con un botón que
        abre el chat con el pedido escrito.
      </p>
    </Card>
  );
}

function DataSection() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Importar"
        footer={
          <Button variant="secondary" onClick={() => navigate("/productos/importar")}>
            Importar productos desde Excel
          </Button>
        }
      >
        <p className="m-0 text-sm text-texto-suave">
          Las listas de precios de proveedores se importan desde Compras.
        </p>
      </Card>
      <Card
        title="Exportar"
        footer={
          <>
            <Button
              variant="secondary"
              icon={<FileText size={18} />}
              onClick={() => void downloadFile("/api/export/products.csv", "productos.csv")}
            >
              Productos
            </Button>
            <Button
              variant="secondary"
              icon={<FileText size={18} />}
              onClick={() => void downloadFile("/api/export/customers.csv", "clientes.csv")}
            >
              Clientes
            </Button>
            <Button
              variant="secondary"
              icon={<FileText size={18} />}
              onClick={() => void downloadFile("/api/export/suppliers.csv", "proveedores.csv")}
            >
              Proveedores
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm text-texto-suave">En CSV, que se abre con Excel.</p>
      </Card>
      <Card title="Copia de seguridad">
        <p className="m-0 text-sm text-texto-suave">
          Todas las noches el servidor guarda una copia cifrada de los datos y las fotos fuera del
          local (7 diarias, 4 semanales y 12 mensuales). Una vez por mes se prueba restaurar.
        </p>
      </Card>
    </div>
  );
}

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  memberName: string | null;
  deviceName: string | null;
  createdAt: string;
  before: unknown;
  after: unknown;
};

function ActivitySection() {
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const q = useQuery({
    queryKey: ["audit", type, from],
    queryFn: () =>
      api<AuditRow[]>(
        `/api/audit?limit=100${type ? `&entityType=${type}` : ""}${from ? `&from=${from}` : ""}`,
      ),
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <SelectField
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-48"
        >
          <option value="">Todo</option>
          {[
            "product",
            "settings",
            "member",
            "sale",
            "shift",
            "supplier",
            "customer_ledger",
            "purchase_order",
          ].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Desde"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="w-44"
        />
      </div>
      {q.isPending ? (
        <SkeletonList rows={6} />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <ul
          className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0 text-sm"
          aria-label="Actividad"
        >
          {q.data.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap gap-x-3 border-b border-borde px-4 py-2 last:border-b-0"
            >
              <span className="tnum w-28 text-texto-suave">
                {formatDate(new Date(a.createdAt)).slice(0, 5)} {formatTime(new Date(a.createdAt))}
              </span>
              <span className="flex-1 font-medium">{a.action}</span>
              <span className="text-texto-suave">
                {a.memberName ?? "—"}
                {a.deviceName ? ` · ${a.deviceName}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FeaturesSection({ s }: { s: SettingsMap }) {
  const save = useSave("features");
  const f = s.features;
  return (
    <Card>
      <p className="m-0 text-sm text-texto-suave">
        Mostrador arranca en modo simple. Prendé estas funciones cuando las necesites.
      </p>
      <Toggle
        label="Promociones"
        hint="2×1, 3×2, segunda unidad, combos, % por categoría o por día."
        checked={f.promotions}
        onChange={(v) => save.mutate({ promotions: v })}
      />
      <Toggle
        label="Lotes y vencimientos"
        hint="Lote y vencimiento al recibir, y avisos de lo que vence."
        checked={f.lots}
        onChange={(v) => save.mutate({ lots: v })}
      />
      <Toggle
        label="Conteos de inventario"
        hint="Conteos ciegos por categoría o góndola."
        checked={f.counts}
        onChange={(v) => save.mutate({ counts: v })}
      />
      <Toggle
        label="Varias cajas"
        hint="Más de un puesto de cobro."
        checked={f.multiRegister}
        onChange={(v) => save.mutate({ multiRegister: v })}
      />
    </Card>
  );
}

function Section({ id, s }: { id: SectionId; s: SettingsMap }) {
  switch (id) {
    case "negocio":
      return <BusinessSection />;
    case "usuarios":
      return <UsersSection />;
    case "cajas":
      return <RegistersSection s={s} />;
    case "medios":
      return <PaymentsSection s={s} />;
    case "precios":
      return <PricingSection s={s} />;
    case "dispositivos":
      return <DevicesSection />;
    case "tickets":
      return <TicketsSection s={s} />;
    case "whatsapp":
      return <WhatsappSection />;
    case "avisos":
      return <AlertsSection s={s} />;
    case "facturacion":
      return <InvoicingSection s={s} />;
    case "datos":
      return <DataSection />;
    case "actividad":
      return <ActivitySection />;
    case "funciones":
      return <FeaturesSection s={s} />;
  }
}

/** Ajustes: lo que se configura una vez. Entra solo el dueño. */
export function SettingsPage() {
  const can = useCan("settings");
  const wide = useWide();
  const navigate = useNavigate();
  const { section } = useParams();
  const [term, setTerm] = useState("");
  const q = useSettingsServer();
  if (!can) return <NoPermissionFor perm="settings" />;
  const t = term.trim().toLowerCase();
  const list = SECTIONS.filter(
    ([, title, desc]) => !t || `${title} ${desc}`.toLowerCase().includes(t),
  );
  const current = (SECTIONS.find(([id]) => id === section) ?? (wide ? SECTIONS[0] : null)) as
    | (typeof SECTIONS)[number]
    | null;
  const nav = (
    <nav aria-label="Secciones de ajustes" className="flex flex-col gap-1">
      <label className="mb-2 flex h-10 items-center gap-2 rounded-lg border border-borde bg-superficie px-3">
        <Search size={16} className="text-texto-suave" aria-hidden />
        <input
          aria-label="Buscar en ajustes"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar"
          className="w-full bg-transparent outline-none"
        />
      </label>
      {list.map(([id, title, desc]) => (
        <button
          key={id}
          type="button"
          onClick={() => navigate(`/ajustes/${id}`)}
          className={cx(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-left",
            current?.[0] === id && wide
              ? "bg-primario-suave text-primario"
              : "hover:bg-neutro-suave",
            !wide && "border-b border-borde py-3",
          )}
        >
          <span className="flex-1">
            <span className="block text-sm font-semibold">{title}</span>
            {!wide && <span className="block text-xs text-texto-suave">{desc}</span>}
          </span>
          {!wide && <ChevronRight size={16} className="text-texto-suave" aria-hidden />}
        </button>
      ))}
    </nav>
  );
  const body = current && (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="m-0 text-xl font-semibold">{current[1]}</h2>
        <div className="text-sm text-texto-suave">{current[2]}</div>
      </div>
      {q.isPending ? (
        <SkeletonList rows={5} />
      ) : q.isError ? (
        <ErrorState message="Los ajustes se cambian con conexión." onRetry={() => q.refetch()} />
      ) : (
        <Section key={current[0]} id={current[0]} s={q.data} />
      )}
    </div>
  );
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="m-0 text-[22px] font-semibold">Ajustes</h1>
      {wide ? (
        <div className="grid grid-cols-[240px_minmax(0,1fr)] gap-6">
          {nav}
          {body}
        </div>
      ) : current ? (
        <>
          <Button
            variant="ghost"
            className="self-start"
            icon={<ChevronLeft size={18} />}
            onClick={() => navigate("/ajustes")}
          >
            Ajustes
          </Button>
          {body}
        </>
      ) : (
        nav
      )}
    </div>
  );
}
