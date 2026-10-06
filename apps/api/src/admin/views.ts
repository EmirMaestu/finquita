// apps/api/src/admin/views.ts
import { formatDate, formatTime } from "@mostrador/shared";
import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { Role } from "../db/schema/index";
import type { Backup, SystemStatus } from "./status";
import type { AdminUser } from "./users";

export type Flash = { kind: "ok" | "error"; text: string; secret?: string };

const ROLE_LABEL: Record<Role, string> = {
  owner: "Dueño",
  manager: "Encargado",
  cashier: "Cajero",
  stocker: "Repositor",
};

const when = (d: Date | null) => (d ? `${formatDate(d)} ${formatTime(d)}` : "—");

export function bytes(n: number | null): string {
  if (n === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })} ${units[i]}`;
}

const CSS = `
:root{--fondo:#faf8f5;--superficie:#fff;--borde:#e7e2da;--texto:#1f1b16;--suave:#6b635a;
--primario:#1f6b4f;--exito:#177a48;--exito-s:#e3f2e9;--peligro:#c2362f;--peligro-s:#fbe5e3}
@media (prefers-color-scheme:dark){:root{--fondo:#14120f;--superficie:#1d1a16;--borde:#34302a;
--texto:#f2eee8;--suave:#b3aaa0;--exito-s:#17301f;--peligro-s:#3a1c1a}}
*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--texto);
font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:16px}
header{display:flex;justify-content:space-between;align-items:center;gap:8px}
h1{font-size:20px;margin:8px 0}h2{font-size:17px;margin:24px 0 8px}
section{background:var(--superficie);border:1px solid var(--borde);border-radius:12px;padding:16px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 6px;
border-bottom:1px solid var(--borde);vertical-align:middle}th{color:var(--suave);font-weight:500}
.scroll{overflow-x:auto}.ok{color:var(--exito)}.mal{color:var(--peligro)}.suave{color:var(--suave)}
.flash{padding:12px;border-radius:8px;margin:12px 0}.flash.ok{background:var(--exito-s)}
.flash.error{background:var(--peligro-s)}code{font-size:18px;font-weight:600;letter-spacing:1px}
form{display:inline-flex;gap:6px;margin:2px 0}input{font:inherit;padding:6px 8px;
border:1px solid var(--borde);border-radius:8px;background:var(--superficie);color:var(--texto)}
input[name=pin]{width:90px}button{font:inherit;padding:6px 12px;border-radius:8px;
border:1px solid var(--primario);background:var(--primario);color:#fff;cursor:pointer}
button.sec{background:transparent;color:var(--primario)}
.login{max-width:360px;margin:15vh auto}.login form{display:flex;flex-direction:column;width:100%}
`;

function layout(title: string, body: HtmlEscapedString | Promise<HtmlEscapedString>) {
  return html`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${title}</title>
    <style>${raw(CSS)}</style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

export function loginPage(error?: string) {
  return layout(
    "Panel de soporte",
    html`<div class="login">
      <h1>Panel de soporte</h1>
      ${error ? html`<p class="flash error">${error}</p>` : ""}
      <form method="post" action="/api/admin/login">
        <input type="password" name="password" placeholder="Contraseña" autofocus required />
        <button type="submit">Entrar</button>
      </form>
    </div>`,
  );
}

export function errorPage(requestId: string) {
  return layout(
    "Algo falló",
    html`<h1>Algo falló</h1>
      <p>Buscá este código en los logs de la API: <code>${requestId}</code></p>
      <p><a href="/api/admin">Volver al panel</a></p>`,
  );
}

function statusRows(s: SystemStatus | null) {
  if (!s) return html`<p class="mal">No disponible</p>`;
  const row = (label: string, value: unknown, ok?: boolean) =>
    html`<tr>
      <th>${label}</th>
      <td class="${ok === undefined ? "" : ok ? "ok" : "mal"}">${value}</td>
    </tr>`;
  return html`<table>
    ${row("Versión", `${s.version} · prendida desde ${when(s.startedAt)}`)}
    ${row(
      "Base",
      s.db.ok ? `Responde en ${s.db.ms} ms · ${bytes(s.db.sizeBytes)}` : "No responde",
      s.db.ok,
    )}
    ${row(
      "Worker",
      s.worker.lastRun ? `Última corrida: ${when(s.worker.lastRun)}` : "Sin corridas registradas",
      !s.worker.stale,
    )}
    ${row(
      "Disco",
      s.disk ? `${bytes(s.disk.freeBytes)} libres de ${bytes(s.disk.totalBytes)}` : "No disponible",
    )}
    ${row(
      "Última copia",
      s.lastBackup
        ? `${when(s.lastBackup.modifiedAt)} · ${bytes(s.lastBackup.size)}`
        : "Todavía no hay copias",
      !s.backupStale,
    )}
  </table>`;
}

function usersTable(users: AdminUser[] | null) {
  if (!users) return html`<p class="mal">No disponible</p>`;
  return html`<div class="scroll">
    <table>
      <tr>
        <th>Nombre</th>
        <th>Rol</th>
        <th>Email</th>
        <th>Último ingreso</th>
        <th>Acciones</th>
      </tr>
      ${users.map(
        (u) => html`<tr>
          <td>${u.name}${u.active ? "" : html` <span class="suave">(inactivo)</span>`}</td>
          <td>${ROLE_LABEL[u.role]}</td>
          <td>${u.email ?? "—"}</td>
          <td>${when(u.lastLogin)}</td>
          <td>
            ${
              u.hasAccount
                ? html`<form method="post" action="/api/admin/users/${u.id}/password">
                    <button class="sec" type="submit">Resetear contraseña</button>
                  </form>`
                : ""
            }
            ${
              u.hasPin
                ? html`<form method="post" action="/api/admin/users/${u.id}/pin">
                    <input name="pin" inputmode="numeric" pattern="[0-9]{4,6}"
                      placeholder="PIN nuevo" required />
                    <button class="sec" type="submit">Resetear PIN</button>
                  </form>`
                : ""
            }
          </td>
        </tr>`,
      )}
    </table>
  </div>`;
}

function backupsTable(backups: Backup[]) {
  if (!backups.length) return html`<p class="suave">Todavía no hay copias.</p>`;
  return html`<table>
    ${backups.map(
      (b) => html`<tr>
        <td>${when(b.modifiedAt)}</td>
        <td>${bytes(b.size)}</td>
        <td><a href="/api/admin/backups/${b.name}">Descargar</a></td>
      </tr>`,
    )}
  </table>`;
}

export function panelPage(p: {
  status: SystemStatus | null;
  users: AdminUser[] | null;
  backups: Backup[];
  flash?: Flash;
}) {
  return layout(
    "Panel de soporte",
    html`<header>
        <h1>Panel de soporte</h1>
        <form method="post" action="/api/admin/logout">
          <button class="sec" type="submit">Salir</button>
        </form>
      </header>
      ${
        p.flash
          ? html`<div class="flash ${p.flash.kind}">
              ${p.flash.text}
              ${p.flash.secret ? html`<br /><code>${p.flash.secret}</code>` : ""}
            </div>`
          : ""
      }
      <h2>Estado del sistema</h2>
      <section>${statusRows(p.status)}</section>
      <h2>Usuarios</h2>
      <section>${usersTable(p.users)}</section>
      <h2>Copias</h2>
      <section>${backupsTable(p.backups)}</section>`,
  );
}
