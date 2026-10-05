import {
  ALERT_LABEL,
  type AlertKindCode,
  formatDate,
  formatTime,
  toDateStr,
  todayAR,
} from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "../data/api";
import { disablePush, enablePush, type PushState, pushState } from "../push";
import { Button } from "../ui/Button";
import { FilterChip } from "../ui/Chip";
import { cx } from "../ui/cx";
import { SelectField } from "../ui/Field";
import { EmptyState, ErrorState, SkeletonList } from "../ui/States";
import { toast } from "../ui/toast";

type AlertItem = {
  id: string;
  kind: AlertKindCode;
  severity: "info" | "warning" | "danger";
  title: string;
  body: string | null;
  status: string;
  read: boolean;
  path: string;
  createdAt: string;
};

const ICON = { info: Info, warning: TriangleAlert, danger: CircleAlert } as const;
const TONE = { info: "text-info", warning: "text-alerta", danger: "text-peligro" } as const;

const when = (iso: string) => {
  const d = new Date(iso);
  return toDateStr(d) === todayAR()
    ? formatTime(d)
    : `${formatDate(d).slice(0, 5)} ${formatTime(d)}`;
};

/** Activar las notificaciones en este dispositivo (en iPhone, con la app instalada). */
function PushCard() {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => {
    void pushState().then(setState);
  }, []);
  const toggle = useMutation({
    mutationFn: () => (state === "on" ? disablePush() : enablePush()),
    onSuccess: (s) => {
      setState(s);
      if (s === "on") toast({ text: "Listo: los avisos te llegan a este dispositivo" });
      if (s === "denied")
        toast({
          text: "El navegador bloqueó las notificaciones. Habilitalas en los ajustes del sistema.",
          tone: "error",
        });
    },
    onError: (e) => toast({ text: (e as Error).message, tone: "error" }),
  });
  if (!state || state === "unsupported") return null;
  return (
    <section
      aria-label="Notificaciones"
      className="flex flex-wrap items-center gap-3 rounded-card border border-borde bg-superficie p-4 text-sm"
    >
      <BellRing size={22} className="text-primario" aria-hidden />
      <span className="min-w-0 flex-1">
        {state === "needs-install"
          ? "Para recibir avisos en el iPhone, agregá Mostrador a la pantalla de inicio desde Safari (Compartir → Agregar a inicio) y abrilo desde ahí."
          : state === "denied"
            ? "Las notificaciones están bloqueadas para esta app. Habilitalas en los ajustes del navegador."
            : state === "on"
              ? "Los avisos te llegan a este dispositivo."
              : "Recibí los avisos importantes en este dispositivo, aunque la app esté cerrada."}
      </span>
      {(state === "on" || state === "off") && (
        <Button
          variant={state === "on" ? "ghost" : "primary"}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {state === "on" ? "Desactivar" : "Activar notificaciones"}
        </Button>
      )}
    </section>
  );
}

/** Centro de avisos: sin leer o todos, por tipo; cada uno lleva a su pantalla, se pospone o se resuelve. */
export function AlertsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"open" | "unread">("open");
  const [kind, setKind] = useState("");
  const q = useQuery({
    queryKey: ["alerts", filter, kind],
    queryFn: () =>
      api<{ items: AlertItem[]; unread: number }>(
        `/api/alerts?filter=${filter}${kind ? `&kind=${kind}` : ""}`,
      ),
  });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["alerts"] });
    await qc.invalidateQueries({ queryKey: ["alerts-count"] });
  };
  const act = useMutation({
    mutationFn: ({
      id,
      action,
      hours,
    }: {
      id: string;
      action: "read" | "snooze" | "resolve";
      hours?: number;
    }) => api(`/api/alerts/${id}/${action}`, { body: action === "snooze" ? { hours } : {} }),
    onSuccess: async (_r, v) => {
      if (v.action === "snooze") toast({ text: "Pospuesto: vuelve a aparecer después" });
      if (v.action === "resolve") toast({ text: "Resuelto" });
      await refresh();
    },
  });
  const readAll = useMutation({
    mutationFn: () => api("/api/alerts/read-all", { body: {} }),
    onSuccess: refresh,
  });
  const kinds = [...new Set((q.data?.items ?? []).map((a) => a.kind))];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-[22px] font-semibold">Avisos</h1>
        {!!q.data?.unread && (
          <Button variant="ghost" onClick={() => readAll.mutate()}>
            Marcar todo como leído
          </Button>
        )}
      </div>
      <PushCard />
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "open"} onClick={() => setFilter("open")}>
          Todos
        </FilterChip>
        <FilterChip active={filter === "unread"} onClick={() => setFilter("unread")}>
          Sin leer{q.data ? ` · ${q.data.unread}` : ""}
        </FilterChip>
        <SelectField
          label="Tipo"
          className="ml-auto w-56"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="">Todos los tipos</option>
          {(kind && !kinds.includes(kind as AlertKindCode)
            ? [...kinds, kind as AlertKindCode]
            : kinds
          ).map((k) => (
            <option key={k} value={k}>
              {ALERT_LABEL[k] ?? k}
            </option>
          ))}
        </SelectField>
      </div>
      {q.isPending ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState message="Los avisos se ven con conexión." onRetry={() => q.refetch()} />
      ) : !q.data.items.length ? (
        <EmptyState title="No hay avisos" body="Cuando algo necesite tu atención, aparece acá." />
      ) : (
        <ul
          className="m-0 list-none overflow-hidden rounded-card border border-borde bg-superficie p-0"
          aria-label="Lista de avisos"
        >
          {q.data.items.map((a) => {
            const Icon = ICON[a.severity] ?? Bell;
            return (
              <li
                key={a.id}
                className={cx(
                  "flex items-start gap-3 border-b border-borde px-4 py-3 last:border-b-0",
                  !a.read && "bg-primario-suave/40",
                )}
              >
                <Icon size={20} className={cx("mt-0.5 shrink-0", TONE[a.severity])} aria-hidden />
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    if (!a.read) act.mutate({ id: a.id, action: "read" });
                    navigate(a.path);
                  }}
                >
                  <span className={cx("block", !a.read && "font-semibold")}>{a.title}</span>
                  {a.body && <span className="block text-[13px] text-texto-suave">{a.body}</span>}
                  <span className="block text-xs text-texto-apagado">
                    {ALERT_LABEL[a.kind] ?? a.kind} · {when(a.createdAt)}
                  </span>
                </button>
                <span className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <Button
                    variant="ghost"
                    onClick={() => act.mutate({ id: a.id, action: "snooze", hours: 4 })}
                    aria-label={`Posponer ${a.title}`}
                  >
                    Posponer
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => act.mutate({ id: a.id, action: "resolve" })}
                    aria-label={`Resolver ${a.title}`}
                  >
                    Resolver
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
