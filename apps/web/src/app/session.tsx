import type { Grant, Permission, Role } from "@mostrador/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import { ApiError, api, credentials, OfflineError } from "../data/api";

export type Me = {
  business: { name: string };
  member: { id: string; name: string; role: Role; email: string | null };
  permissions: Record<Permission, Grant>;
  device: { id: string; name: string; registerId: string | null } | null;
  via: "password" | "pin";
};

export type Session =
  | { status: "loading" }
  | { status: "anonymous"; hasDevice: boolean }
  | { status: "ready"; me: Me; offline: boolean };

const CACHE = "mostrador.me";

function cachedMe(): Me | null {
  try {
    const raw = localStorage.getItem(CACHE);
    return raw ? (JSON.parse(raw) as Me) : null;
  } catch {
    return null;
  }
}

/** Quién está usando la app. Sin conexión, usa la última sesión conocida. */
export function useSessionQuery(): Session {
  const q = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const me = await api<Me>("/api/me");
        try {
          localStorage.setItem(CACHE, JSON.stringify(me));
        } catch {}
        return { me, offline: false };
      } catch (err) {
        if (err instanceof OfflineError) {
          const me = cachedMe();
          if (me) return { me, offline: true };
        }
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
  if (q.isPending) return { status: "loading" };
  if (q.isError || !q.data)
    return { status: "anonymous", hasDevice: Boolean(credentials.get().deviceToken) };
  return { status: "ready", me: q.data.me, offline: q.data.offline };
}

const SessionContext = createContext<Me | null>(null);

export function SessionProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  return <SessionContext.Provider value={me}>{children}</SessionContext.Provider>;
}

export function useMe(): Me | null {
  return useContext(SessionContext);
}

/** Qué puede hacer la persona: "allow", "pin", "deny", "approval" u "own". */
export function useGrant(perm: Permission): Grant {
  const me = useMe();
  return me?.permissions[perm] ?? "deny";
}

export function useCan(perm: Permission): boolean {
  const g = useGrant(perm);
  return g !== "deny";
}

/** Cierra la sesión (con PIN o la cuenta) y vuelve al ingreso. */
export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    const { pinToken } = credentials.get();
    if (pinToken) {
      await api("/api/pin/logout", { method: "POST", body: {} }).catch(() => {});
      credentials.setPin(null);
    } else {
      await api("/api/auth/sign-out", { method: "POST", body: {} }).catch(() => {});
    }
    try {
      localStorage.removeItem(CACHE);
    } catch {}
    await qc.invalidateQueries({ queryKey: ["me"] });
  };
}
