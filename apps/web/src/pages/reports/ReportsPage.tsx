import {
  formatDate,
  formatMoney,
  formatPercent,
  formatQty,
  PERIOD_LABEL,
  type PeriodPreset,
  parseMoney,
  type Report,
  type ReportCell,
  type ReportColumn,
  todayAR,
  writeCsv,
  writeXlsx,
} from "@mostrador/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { NoPermissionFor } from "../../app/guards";
import { useGrant } from "../../app/session";
import { api } from "../../data/api";
import { Button } from "../../ui/Button";
import { FilterChip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { TextField } from "../../ui/Field";
import { EmptyState, ErrorState, SkeletonList } from "../../ui/States";
import { useWide } from "../../ui/useMedia";

type Kind = "sales" | "profitability" | "stock" | "cash" | "purchases" | "credit" | "result";
type Loaded = Report & { kind: Kind; range: { from: string; to: string } };

const KINDS: { kind: Kind; title: string; question: string; profit?: boolean; period?: boolean }[] =
  [
    { kind: "sales", title: "Ventas", question: "¿Cuánto vendí y cuándo?", period: true },
    {
      kind: "profitability",
      title: "Rentabilidad",
      question: "¿Dónde gano y dónde pierdo?",
      profit: true,
      period: true,
    },
    { kind: "stock", title: "Stock", question: "¿Cuánta plata tengo en la góndola?", period: true },
    { kind: "cash", title: "Caja", question: "¿Cuadran los turnos?", period: true },
    {
      kind: "purchases",
      title: "Compras",
      question: "¿A quién le compro y cuánto aumenta?",
      period: true,
    },
    { kind: "credit", title: "Fiado", question: "¿Cuánta plata tengo en la calle?" },
    {
      kind: "result",
      title: "Resultado del mes",
      question: "¿Gané plata este mes?",
      profit: true,
      period: true,
    },
  ];
const PRESETS: PeriodPreset[] = ["today", "yesterday", "7d", "month", "last_month", "custom"];

function fmt(
  v: ReportCell,
  kind?: ReportColumn["kind"] | "money" | "int" | "percent" | "qty",
): string {
  if (v == null) return "—";
  if (typeof v === "string") return kind === "date" ? formatDate(v) : v;
  switch (kind) {
    case "money":
      return v < 0 ? `−${formatMoney(-v)}` : formatMoney(v);
    case "percent":
      return `${v < 0 ? "−" : ""}${formatPercent(Math.abs(v))}`;
    case "qty":
      return formatQty(v, Number.isInteger(v) ? "unit" : "kg");
    default:
      return new Intl.NumberFormat("es-AR").format(v);
  }
}

function useReport(kind: Kind, params: URLSearchParams, enabled = true) {
  const qs = new URLSearchParams();
  for (const k of ["preset", "from", "to", "categoryId"]) {
    const v = params.get(k);
    if (v) qs.set(k, v);
  }
  if (!qs.get("preset")) qs.set("preset", "month");
  return useQuery({
    queryKey: ["report", kind, qs.toString()],
    queryFn: () => api<Loaded>(`/api/reports/${kind}?${qs}`),
    enabled,
  });
}

/** Excel o CSV con todas las tablas del reporte, una debajo de la otra. */
function exportRows(r: Loaded): (string | number | null)[][] {
  const out: (string | number | null)[][] = [
    [r.question],
    [`${formatDate(r.range.from)} al ${formatDate(r.range.to)}`],
    [r.headline.label, r.headline.value / (r.headline.kind === "money" ? 100 : 1)],
    [],
  ];
  for (const t of r.tables) {
    out.push([t.title]);
    out.push(t.columns.map((c) => c.label));
    for (const row of t.rows)
      out.push(
        t.columns.map((c) => {
          const v = row[c.key] ?? null;
          return typeof v === "number" && c.kind === "money"
            ? v / 100
            : typeof v === "number" && c.kind === "percent"
              ? v / 10000
              : v;
        }),
      );
    out.push([]);
  }
  return out;
}

function save(data: BlobPart, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function Bars({ chart }: { chart: NonNullable<Report["chart"]> }) {
  const max = Math.max(1, ...chart.points.map((p) => Math.max(p.value, p.previous ?? 0)));
  const many = chart.points.length > 12;
  return (
    <section
      aria-label={chart.label}
      className="rounded-card border border-borde bg-superficie p-4"
    >
      <div className="mb-2 text-sm font-semibold">{chart.label}</div>
      <div className="flex h-40 items-end gap-1 overflow-x-auto">
        {chart.points.map((p) => (
          <div
            key={p.label}
            className="flex h-full min-w-3 flex-1 flex-col items-center justify-end gap-1"
            title={`${p.label}: ${formatMoney(p.value)}${p.previous != null ? ` · antes ${formatMoney(p.previous)}` : ""}`}
          >
            <div className="flex h-full w-full items-end gap-0.5">
              {p.previous != null && (
                <div
                  className="flex-1 rounded-t bg-neutro-suave"
                  style={{ height: `${(p.previous / max) * 100}%` }}
                />
              )}
              <div
                className="flex-1 rounded-t bg-primario"
                style={{ height: `${(p.value / max) * 100}%` }}
              />
            </div>
            {!many && (
              <span className="text-[11px] whitespace-nowrap text-texto-suave">{p.label}</span>
            )}
          </div>
        ))}
      </div>
      {chart.points.some((p) => p.previous != null) && (
        <div className="mt-2 flex gap-4 text-xs text-texto-suave">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-primario" /> Este período
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-sm bg-neutro-suave" /> Anterior
          </span>
        </div>
      )}
    </section>
  );
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const hours = Array.from({ length: 16 }, (_, i) => i + 7);
  return (
    <section
      aria-label="Mapa de calor día por hora"
      className="overflow-x-auto rounded-card border border-borde bg-superficie p-4"
    >
      <div className="mb-2 text-sm font-semibold">Día × hora</div>
      <table className="border-separate border-spacing-0.5 text-[11px]">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} className="font-normal text-texto-suave">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <tr key={d}>
              <th className="pr-1 text-left font-normal text-texto-suave">{DAYS[d]}</th>
              {hours.map((h) => {
                const v = grid[d]?.[h] ?? 0;
                return (
                  <td
                    key={h}
                    title={formatMoney(v)}
                    className="size-5 rounded-sm"
                    style={{
                      background: v
                        ? `color-mix(in srgb, var(--primario) ${Math.round(15 + (v / max) * 85)}%, transparent)`
                        : "var(--neutro-suave)",
                    }}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function FixedExpenses() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["fixed-expenses"],
    queryFn: () => api<{ id: string; name: string; monthlyCents: number }[]>("/api/fixed-expenses"),
  });
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["fixed-expenses"] });
    await qc.invalidateQueries({ queryKey: ["report", "result"] });
  };
  const add = useMutation({
    mutationFn: () =>
      api("/api/fixed-expenses", {
        body: { name: name.trim(), monthlyCents: parseMoney(amount) ?? 0 },
      }),
    onSuccess: async () => {
      setName("");
      setAmount("");
      await done();
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/api/fixed-expenses/${id}`, { method: "DELETE" }),
    onSuccess: done,
  });
  return (
    <section
      aria-label="Gastos fijos"
      className="rounded-card border border-borde bg-superficie p-4 text-sm"
    >
      <div className="mb-1 font-semibold">Gastos fijos del mes</div>
      <p className="m-0 mb-2 text-xs text-texto-suave">
        Lo que se paga por fuera de la caja: alquiler, servicios, sueldos. Se reparte por día.
      </p>
      {(list.data ?? []).map((f) => (
        <div key={f.id} className="flex items-center gap-2 border-t border-borde py-1.5">
          <span className="flex-1">{f.name}</span>
          <span className="tnum">{formatMoney(f.monthlyCents)} por mes</span>
          <Button variant="ghost" onClick={() => del.mutate(f.id)} aria-label={`Borrar ${f.name}`}>
            Borrar
          </Button>
        </div>
      ))}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <TextField
          label="Concepto"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alquiler"
          className="min-w-40 flex-1"
        />
        <TextField
          label="Por mes"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-32"
        />
        <Button
          variant="secondary"
          disabled={!name.trim() || !(parseMoney(amount) ?? 0)}
          onClick={() => add.mutate()}
        >
          Agregar
        </Button>
      </div>
    </section>
  );
}

function ReportView({ kind }: { kind: Kind }) {
  const [params, setParams] = useSearchParams();
  const meta = KINDS.find((k) => k.kind === kind);
  const q = useReport(kind, params);
  const preset = (params.get("preset") as PeriodPreset | null) ?? "month";
  const set = (patch: Record<string, string | null>) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      for (const [k, v] of Object.entries(patch))
        if (v == null) n.delete(k);
        else n.set(k, v);
      return n;
    });
  const r = q.data;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="m-0 text-xl font-semibold">{meta?.title}</h2>
        <div className="text-sm text-texto-suave">{meta?.question}</div>
      </div>
      {meta?.period && (
        <fieldset className="m-0 flex flex-wrap items-end gap-2 border-0 p-0" aria-label="Período">
          {PRESETS.map((p) => (
            <FilterChip
              key={p}
              active={preset === p}
              onClick={() =>
                set({
                  preset: p,
                  ...(p === "custom"
                    ? { from: params.get("from") ?? todayAR(), to: params.get("to") ?? todayAR() }
                    : { from: null, to: null }),
                })
              }
            >
              {PERIOD_LABEL[p]}
            </FilterChip>
          ))}
          {preset === "custom" && (
            <>
              <TextField
                label="Desde"
                type="date"
                value={params.get("from") ?? ""}
                onChange={(e) => set({ from: e.target.value })}
                className="w-40"
              />
              <TextField
                label="Hasta"
                type="date"
                value={params.get("to") ?? ""}
                onChange={(e) => set({ to: e.target.value })}
                className="w-40"
              />
            </>
          )}
        </fieldset>
      )}
      {q.isPending ? (
        <SkeletonList rows={5} />
      ) : q.isError ? (
        <ErrorState message="Los reportes se ven con conexión." onRetry={() => q.refetch()} />
      ) : r ? (
        <>
          <section
            aria-label="Respuesta"
            className="flex flex-wrap items-end gap-x-8 gap-y-3 rounded-card border border-borde bg-superficie p-5"
          >
            <div>
              <div className="text-sm text-texto-suave">{r.headline.label}</div>
              <div
                className={cx(
                  "tnum text-[40px] leading-tight font-semibold",
                  r.headline.kind === "money" && r.headline.value < 0 && "text-peligro",
                )}
              >
                {fmt(r.headline.value, r.headline.kind)}
              </div>
              {r.headline.deltaBp != null && (
                <div
                  className={cx(
                    "inline-flex items-center gap-1 text-sm font-semibold",
                    r.headline.deltaBp >= 0 ? "text-exito" : "text-peligro",
                  )}
                >
                  {r.headline.deltaBp >= 0 ? (
                    <ArrowUpRight size={16} aria-hidden />
                  ) : (
                    <ArrowDownRight size={16} aria-hidden />
                  )}
                  {fmt(r.headline.deltaBp, "percent")} contra el período anterior (
                  {fmt(r.headline.previous ?? 0, r.headline.kind)})
                </div>
              )}
              {r.headline.hint && <div className="text-sm text-texto-suave">{r.headline.hint}</div>}
            </div>
            {r.stats?.map((s) => (
              <div key={s.label}>
                <div className="text-xs text-texto-suave">{s.label}</div>
                <div className="tnum text-lg font-semibold">{fmt(s.value, s.kind)}</div>
              </div>
            ))}
            <span className="flex-1" />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                icon={<FileSpreadsheet size={18} />}
                onClick={() =>
                  save(
                    writeXlsx(exportRows(r), meta?.title) as BlobPart,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    `${kind}-${r.range.from}.xlsx`,
                  )
                }
              >
                Excel
              </Button>
              <Button
                variant="ghost"
                icon={<Download size={18} />}
                onClick={() =>
                  save(
                    writeCsv(exportRows(r)),
                    "text/csv;charset=utf-8",
                    `${kind}-${r.range.from}.csv`,
                  )
                }
              >
                CSV
              </Button>
            </div>
          </section>
          {params.get("categoryId") && (
            <Button
              variant="ghost"
              className="self-start"
              icon={<ChevronLeft size={18} />}
              onClick={() => set({ categoryId: null })}
            >
              Todas las categorías
            </Button>
          )}
          {r.chart && r.chart.points.length > 0 && <Bars chart={r.chart} />}
          {r.chart?.grid && <Heatmap grid={r.chart.grid} />}
          {kind === "result" && <FixedExpenses />}
          {r.tables.map((t) => (
            <section
              key={t.key}
              aria-label={t.title}
              className="overflow-hidden rounded-card border border-borde bg-superficie"
            >
              <div className="border-b border-borde px-4 py-2.5 text-sm font-semibold">
                {t.title}
              </div>
              {!t.rows.length ? (
                <div className="px-4 py-4 text-sm text-texto-suave">Nada en este período.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs text-texto-suave">
                        {t.columns.map((c, i) => (
                          <th
                            key={c.key}
                            className={cx(
                              "px-4 py-2 font-semibold whitespace-nowrap",
                              i > 0 &&
                                c.kind &&
                                c.kind !== "text" &&
                                c.kind !== "date" &&
                                "text-right",
                            )}
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {t.rows
                        .slice(0, 200)
                        .map((row, i) => ({ row, rowKey: `${t.key}:${i}` }))
                        .map(({ row, rowKey }) => {
                          const drill = t.drill ? (row[t.drill.column] as string | null) : null;
                          return (
                            <tr
                              key={rowKey}
                              className={cx(
                                "border-t border-borde",
                                drill && drill !== "none" && "cursor-pointer hover:bg-neutro-suave",
                              )}
                              onClick={
                                drill && drill !== "none" && t.drill
                                  ? () => set({ [t.drill?.param ?? "categoryId"]: drill })
                                  : undefined
                              }
                            >
                              {t.columns.map((c, i) => (
                                <td
                                  key={c.key}
                                  className={cx(
                                    "px-4 py-2",
                                    i > 0 &&
                                      c.kind &&
                                      c.kind !== "text" &&
                                      c.kind !== "date" &&
                                      "tnum text-right whitespace-nowrap",
                                    row.name === "Resultado" && "font-semibold",
                                  )}
                                >
                                  {fmt(row[c.key] ?? null, c.kind)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}

function Card({ k }: { k: (typeof KINDS)[number] }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = useReport(k.kind, params);
  return (
    <button
      type="button"
      onClick={() => navigate(`/reportes/${k.kind}`)}
      className="flex flex-col gap-1 rounded-card border border-borde bg-superficie p-4 text-left"
    >
      <span className="text-sm text-texto-suave">{k.question}</span>
      <span className="font-semibold">{k.title}</span>
      <span className="tnum text-2xl font-semibold">
        {q.data ? fmt(q.data.headline.value, q.data.headline.kind) : "…"}
      </span>
      {q.data?.headline.deltaBp != null && (
        <span
          className={cx(
            "text-xs font-semibold",
            q.data.headline.deltaBp >= 0 ? "text-exito" : "text-peligro",
          )}
        >
          {fmt(q.data.headline.deltaBp, "percent")} vs. el período anterior
        </span>
      )}
    </button>
  );
}

/** Reportes: cada uno responde una pregunta del dueño. */
export function ReportsPage() {
  const grant = useGrant("reports");
  const profit = useGrant("reports_profitability") === "allow";
  const wide = useWide();
  const navigate = useNavigate();
  const { kind } = useParams();
  if (grant === "deny") return <NoPermissionFor perm="reports" />;
  const list = KINDS.filter((k) => (grant === "own" ? k.kind === "sales" : !k.profit || profit));
  if (!list.length) return <EmptyState title="No hay reportes para tu rol" />;
  const current = (list.find((k) => k.kind === kind) ?? (wide ? list[0] : null))?.kind ?? null;
  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <h1 className="m-0 text-[22px] font-semibold">Reportes</h1>
      {wide ? (
        <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-6">
          <nav aria-label="Reportes" className="flex flex-col gap-1">
            {list.map((k) => (
              <button
                key={k.kind}
                type="button"
                onClick={() => navigate(`/reportes/${k.kind}`)}
                className={cx(
                  "rounded-lg px-3 py-2 text-left text-sm",
                  current === k.kind
                    ? "bg-primario-suave font-semibold text-primario"
                    : "hover:bg-neutro-suave",
                )}
              >
                {k.title}
              </button>
            ))}
          </nav>
          {current && <ReportView key={current} kind={current} />}
        </div>
      ) : current ? (
        <>
          <Button
            variant="ghost"
            className="self-start"
            icon={<ChevronLeft size={18} />}
            onClick={() => navigate("/reportes")}
          >
            Reportes
          </Button>
          <ReportView key={current} kind={current} />
        </>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {list.map((k) => (
            <Card key={k.kind} k={k} />
          ))}
        </div>
      )}
    </div>
  );
}
