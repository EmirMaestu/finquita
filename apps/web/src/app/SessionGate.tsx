import type { Permission } from "@mostrador/shared";
import { type ReactNode, useEffect, useState } from "react";
import { credentials } from "../data/api";
import { localDb, PULL_TABLES } from "../data/db";
import { isSaleInProgress } from "../lib/saleActivity";
import { LockScreen } from "../pages/auth/LockScreen";
import { LoginPage } from "../pages/auth/LoginPage";
import { primeSaleNumbers } from "../sell/complete";
import { syncEngine } from "../sync";
import { SkeletonList } from "../ui/States";
import { LiveShell } from "./LiveShell";
import { lockScreen, useLockScreen } from "./lock";
import type { ModuleId } from "./modules";
import { type Me, SessionProvider, useSessionQuery } from "./session";

/** Módulos que ve cada uno según sus permisos (lo que no puede usar, no aparece). */
export function modulesFor(me: Me): ModuleId[] {
  const p = me.permissions;
  const can = (x: Permission) => p[x] !== "deny";
  const mods: ModuleId[] = ["inicio"];
  if (can("sell")) mods.push("vender");
  if (can("shift")) mods.push("caja");
  mods.push("productos");
  if (can("build_orders") || can("count_receive") || can("note_shortages")) mods.push("compras");
  if (can("sell")) mods.push("clientes");
  if (can("reports")) mods.push("reportes");
  if (can("settings")) mods.push("ajustes");
  return mods;
}

/** Si no hay sesión: PIN en un dispositivo habilitado o email y contraseña. */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSessionQuery();
  const [screen, setScreen] = useState<"pin" | "password" | null>(null);
  if (session.status === "loading") {
    return (
      <div className="p-6">
        <SkeletonList />
      </div>
    );
  }
  if (session.status === "anonymous") {
    const usePin = screen === "pin" || (screen === null && session.hasDevice);
    return usePin ? (
      <LockScreen onPassword={() => setScreen("password")} />
    ) : (
      <LoginPage onLockScreen={session.hasDevice ? () => setScreen("pin") : undefined} />
    );
  }
  const { me } = session;
  return (
    <SessionProvider me={me}>
      <SyncOnLogin me={me} />
      <IdleLock />
      <LiveShell
        base={{
          businessName: me.business?.name ?? "Mostrador",
          user: { name: me.member.name },
          visibleModules: modulesFor(me),
        }}
      >
        {children}
      </LiveShell>
    </SessionProvider>
  );
}

const IDLE_MS = 5 * 60_000;

/**
 * En un dispositivo habilitado, la sesión con PIN se bloquea sola tras unos minutos sin uso
 * (nunca en el medio de una venta).
 */
function IdleLock() {
  const locked = useLockScreen();
  useEffect(() => {
    if (!credentials.get().pinToken) return;
    let timer = setTimeout(() => !isSaleInProgress() && lockScreen.open(), IDLE_MS);
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => !isSaleInProgress() && lockScreen.open(), IDLE_MS);
    };
    const events = ["keydown", "pointerdown", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, reset);
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, []);
  return locked ? <LockScreen onCancel={() => lockScreen.close()} /> : null;
}

/**
 * Al entrar alguien, sincroniza. Si cambia lo que puede ver (costos), la copia local se
 * vuelve a bajar entera para no dejar a la vista lo que no le corresponde.
 */
function SyncOnLogin({ me }: { me: Me }) {
  const seesCosts = me.permissions.view_costs === "allow";
  useEffect(() => {
    void (async () => {
      const db = localDb();
      const viewer = seesCosts ? "costs" : "no-costs";
      if ((await db.getMeta<string>("sync.viewer")) !== viewer) {
        await db.transaction("rw", [...PULL_TABLES.map((t) => db[t]), db.meta], async () => {
          for (const t of PULL_TABLES) await db[t].clear();
          await db.meta.delete("sync.cursor");
          await db.setMeta("sync.viewer", viewer);
        });
      }
      await syncEngine().kick();
      await primeSaleNumbers();
    })();
  }, [seesCosts]);
  return null;
}
