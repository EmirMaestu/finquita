import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Circle, CircleCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, api } from "../../data/api";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/Field";

export type SetupStatus = {
  steps: {
    key: string;
    done: boolean;
    title: string;
    detail?: string;
    action: string;
    path: string;
  }[];
  done: number;
  total: number;
  hasSales: boolean;
  dismissed: boolean;
};

/** Primer uso: después de crear la cuenta, los datos del negocio (y queda la Caja 1). */
export function SetupBusinessPage({ ownerName }: { ownerName: string }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", address: "", city: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      api("/api/setup/business", {
        body: {
          name: f.name.trim(),
          address: f.address.trim() || null,
          city: f.city.trim() || null,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : "No se pudo guardar."),
  });
  return (
    <div className="grid min-h-full place-items-center bg-fondo p-4">
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-card border border-borde bg-superficie p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <h1 className="m-0 text-2xl font-semibold">¡Hola, {ownerName.split(" ")[0]}!</h1>
          <p className="m-0 mt-1 text-sm text-texto-suave">
            Contanos de tu almacén. Después lo podés cambiar en Ajustes.
          </p>
        </div>
        <TextField
          label="Nombre del negocio"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="Almacén La Esquina"
          autoFocus
        />
        <TextField
          label="Dirección"
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
          placeholder="San Martín 1234"
        />
        <TextField
          label="Localidad"
          value={f.city}
          onChange={(e) => setF({ ...f, city: e.target.value })}
          placeholder="Godoy Cruz"
        />
        {error && (
          <div role="alert" className="text-sm font-semibold text-peligro">
            {error}
          </div>
        )}
        <Button type="submit" size="lg" disabled={!f.name.trim() || save.isPending}>
          Empezar
        </Button>
      </form>
    </div>
  );
}

/** Primeros pasos: la checklist que reemplaza al panel mientras no hay ventas. */
export function FirstSteps({ status }: { status: SetupStatus }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dismiss = useMutation({
    mutationFn: () => api("/api/setup/dismiss", { body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["setup"] }),
  });
  const pct = Math.round((status.done / status.total) * 100);
  return (
    <section
      aria-label="Primeros pasos"
      className="flex flex-col gap-4 rounded-card border border-borde bg-superficie p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 flex-1 text-lg font-semibold">Primeros pasos</h2>
        <span className="text-sm text-texto-suave">
          {status.done} de {status.total}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-neutro-suave"
        role="progressbar"
        aria-label="Avance"
        aria-valuemin={0}
        aria-valuemax={status.total}
        aria-valuenow={status.done}
      >
        <div
          className="h-full rounded-full bg-primario transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="m-0 list-none p-0">
        {status.steps.map((s) => (
          <li key={s.key} className="flex items-center gap-3 border-t border-borde py-3">
            {s.done ? (
              <CircleCheck size={22} className="shrink-0 text-exito" aria-label="Hecho" />
            ) : (
              <Circle size={22} className="shrink-0 text-texto-apagado" aria-label="Pendiente" />
            )}
            <span className="min-w-0 flex-1">
              <span className={s.done ? "text-texto-suave line-through" : "font-semibold"}>
                {s.title}
              </span>
              {s.detail && !s.done && (
                <span className="block text-[13px] text-texto-suave">{s.detail}</span>
              )}
            </span>
            {!s.done && (
              <Button variant="secondary" onClick={() => navigate(s.path)}>
                {s.action}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate("/vender")}>Empezar a vender</Button>
        <Button variant="ghost" onClick={() => dismiss.mutate()}>
          Ocultar
        </Button>
      </div>
      <p className="m-0 text-xs text-texto-suave">
        Lo que no está cargado se da de alta al escanearlo en la venta.
      </p>
    </section>
  );
}

export function useSetupStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["setup"],
    queryFn: () => api<SetupStatus>("/api/setup/status"),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
