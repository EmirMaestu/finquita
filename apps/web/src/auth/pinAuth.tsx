import type { Permission } from "@mostrador/shared";
import { useState, useSyncExternalStore } from "react";
import { ApiError, api, OfflineError } from "../data/api";
import { localDb } from "../data/db";
import { PinPad } from "../ui/PinPad";

export type Authorizer = { memberId: string; name: string };

/** Verificador local del PIN (PBKDF2), para autorizar sin conexión con un PIN ya usado acá. */
type Verifier = { memberId: string; name: string; salt: string; hash: string; perms: Permission[] };

const enc = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));

async function derive(pin: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: 100_000 },
    key,
    256,
  );
  return b64(bits);
}

async function remember(a: Authorizer, pin: string, perm: Permission) {
  const db = localDb();
  const all = (await db.getMeta<Verifier[]>("pin.verifiers")) ?? [];
  const prev = all.find((v) => v.memberId === a.memberId);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const v: Verifier = {
    memberId: a.memberId,
    name: a.name,
    salt: b64(salt),
    hash: await derive(pin, salt),
    perms: [...new Set([...(prev?.perms ?? []), perm])],
  };
  await db.setMeta("pin.verifiers", [...all.filter((x) => x.memberId !== a.memberId), v]);
}

async function verifyOffline(pin: string, perm: Permission): Promise<Authorizer | null> {
  const all = (await localDb().getMeta<Verifier[]>("pin.verifiers")) ?? [];
  for (const v of all) {
    if (!v.perms.includes(perm)) continue;
    const salt = Uint8Array.from(atob(v.salt), (ch) => ch.charCodeAt(0));
    if ((await derive(pin, salt)) === v.hash) return { memberId: v.memberId, name: v.name };
  }
  return null;
}

/** Verifica un PIN de autorización: con conexión en el servidor; sin conexión, con lo guardado. */
export async function verifyAuthorizationPin(pin: string, perm: Permission): Promise<Authorizer> {
  try {
    const r = await api<Authorizer>("/api/pin/authorize", { body: { pin, permission: perm } });
    await remember(r, pin, perm).catch(() => {});
    return r;
  } catch (err) {
    if (err instanceof OfflineError) {
      const local = await verifyOffline(pin, perm);
      if (local) return local;
      throw new Error("Sin conexión: ese PIN todavía no se usó en este dispositivo.");
    }
    throw err instanceof ApiError ? new Error(err.message) : err;
  }
}

type Request = {
  perm: Permission;
  title?: string;
  detail: string;
  resolve: (a: Authorizer | null) => void;
};
let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Pide "Autorizá con tu PIN" y devuelve quién autorizó (o null si se canceló). */
export function requestPin(
  perm: Permission,
  detail: string,
  title?: string,
): Promise<Authorizer | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    current = { perm, detail, title, resolve };
    emit();
  });
}

function useRequest() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}

/** Overlay global del PIN de autorización. */
export function PinAuthorizer() {
  const req = useRequest();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  const finish = (a: Authorizer | null) => {
    req.resolve(a);
    current = null;
    setError(null);
    emit();
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(31,27,22,.6)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Autorizá con tu PIN"
        className="flex w-full max-w-[360px] justify-center rounded-2xl bg-superficie px-5 py-6 shadow-xl"
      >
        <PinPad
          title={req.title ?? "Autorizá con tu PIN"}
          subtitle={req.detail}
          error={error}
          busy={busy}
          onCancel={() => finish(null)}
          onSubmit={async (pin) => {
            setBusy(true);
            try {
              finish(await verifyAuthorizationPin(pin, req.perm));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </div>
  );
}
