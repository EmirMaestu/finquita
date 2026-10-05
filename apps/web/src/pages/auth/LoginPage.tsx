import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { ApiError, api, OfflineError } from "../../data/api";
import { Button } from "../../ui/Button";
import { TextField } from "../../ui/Field";

/** Ingreso de dueño y encargado con email y contraseña. La primera vez, el dueño crea su cuenta. */
export function LoginPage({ onLockScreen }: { onLockScreen?: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "up") await api("/api/auth/sign-up/email", { body: { name, email, password } });
      else await api("/api/auth/sign-in/email", { body: { email, password } });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      if (err instanceof OfflineError)
        setError("Sin conexión. Para entrar con email hace falta internet.");
      else if (err instanceof ApiError && err.status === 401)
        setError("El email o la contraseña no son correctos.");
      else if (err instanceof ApiError) setError(err.message);
      else setError("No pudimos entrar. Probá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-fondo p-4">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-borde bg-superficie p-6"
      >
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primario text-base font-bold text-sobre-primario">
            M
          </span>
          <span className="text-lg font-semibold">Mostrador</span>
        </div>
        <h1 className="m-0 text-[22px] font-semibold">
          {mode === "in" ? "Entrá a tu almacén" : "Creá tu cuenta"}
        </h1>
        {mode === "up" && (
          <TextField
            label="Tu nombre"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete={mode === "in" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          hint={mode === "up" ? "Al menos 8 caracteres." : undefined}
        />
        {error && (
          <div
            role="alert"
            className="rounded-lg bg-peligro-suave px-3 py-2 text-[13px] font-semibold text-peligro"
          >
            {error}
          </div>
        )}
        <Button type="submit" size="lg" disabled={busy}>
          {mode === "in" ? "Entrar" : "Crear cuenta"}
        </Button>
        <button
          type="button"
          className="text-sm font-semibold text-primario"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
        >
          {mode === "in" ? "¿Primera vez? Creá la cuenta del dueño" : "Ya tengo cuenta"}
        </button>
        {onLockScreen && (
          <button
            type="button"
            className="text-sm font-semibold text-texto-suave"
            onClick={onLockScreen}
          >
            Entrar con PIN
          </button>
        )}
      </form>
    </div>
  );
}
