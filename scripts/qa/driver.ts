/**
 * Navegador para la QA con usuarios. Mantiene un Chromium abierto y ejecuta "pasos"
 * (archivos JS con acceso a page, context y qa) que le manda scripts/qa/step.ts.
 *
 *   bun scripts/qa/driver.ts --dir qa/ronda-1/apurado --slot 1 --device mac [--vacio] [--3g]
 *
 * Dispositivos: mac (1280×800), iphone375 (375×812) e iphone393 (393×852).
 * La cámara es falsa (camera-init.js): qa.camera.show("7790000001017") la pone frente al visor.
 * La pistola es el simulador de e2e/helpers.ts: qa.gun("7790000001017").
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  type ConsoleMessage,
  chromium,
  type Dialog,
  devices,
  type Page,
} from "@playwright/test";

type Opts = { dir: string; slot: number; device: string; vacio: boolean; g3: boolean };

function parseArgs(): Opts {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const dir = get("--dir");
  if (!dir) throw new Error("Falta --dir qa/ronda-N/usuario");
  return {
    dir: resolve(dir),
    slot: Number(get("--slot") ?? 1),
    device: get("--device") ?? "mac",
    vacio: a.includes("--vacio"),
    g3: a.includes("--3g"),
  };
}

const opts = parseArgs();
mkdirSync(join(opts.dir, "pasos"), { recursive: true });
const webPort = (opts.vacio ? 5175 : 5174) + opts.slot * 10;
const baseURL = `http://localhost:${webPort}`;

const DEVICES: Record<string, Parameters<Browser["newContext"]>[0]> = {
  mac: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
  iphone375: {
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    viewport: { width: 375, height: 812 },
  },
  iphone393: {
    ...devices["iPhone 14 Pro"],
    defaultBrowserType: "chromium",
    viewport: { width: 393, height: 852 },
  },
};
const device = DEVICES[opts.device];
if (!device) throw new Error(`Dispositivo desconocido: ${opts.device}`);

type Event = { t: string; kind: string; text: string; url?: string };
const events: Event[] = [];
const note = (kind: string, text: string, url?: string) =>
  events.push({ t: new Date().toISOString().slice(11, 19), kind, text, url });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...device,
  baseURL,
  locale: "es-AR",
  timezoneId: "America/Argentina/Buenos_Aires",
  serviceWorkers: "allow",
});
await context.addInitScript({ path: join(import.meta.dir, "camera-init.js") });
context.setDefaultTimeout(8000);

const pages: Page[] = [];
const cdp = new WeakMap<Page, CDPSession>();
let dialogAnswer: "accept" | "dismiss" = "accept";

function wire(page: Page) {
  pages.push(page);
  if (opts.g3) throttle(page, true).catch((e) => note("3g", String(e)));
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" || m.type() === "warning")
      note(`console.${m.type()}`, m.text().slice(0, 500), page.url());
  });
  page.on("pageerror", (e) => note("pageerror", String(e).slice(0, 500), page.url()));
  page.on("response", (r) => {
    if (r.status() >= 400) note(`http ${r.status()}`, `${r.request().method()} ${r.url()}`);
  });
  page.on("requestfailed", (r) => {
    note("requestfailed", `${r.method()} ${r.url()} · ${r.failure()?.errorText ?? ""}`);
  });
  page.on("dialog", async (d: Dialog) => {
    note(`dialog.${d.type()}`, d.message());
    if (dialogAnswer === "accept") await d.accept();
    else await d.dismiss();
  });
}
context.on("page", wire);
const first = await context.newPage();

let shots = 0;
const pad = (n: number) => String(n).padStart(2, "0");
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

async function throttle(page: Page, on: boolean) {
  let s = cdp.get(page);
  if (!s) {
    s = await context.newCDPSession(page);
    cdp.set(page, s);
  }
  await s.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: on ? 400 : 0,
    downloadThroughput: on ? (400 * 1000) / 8 : -1,
    uploadThroughput: on ? (400 * 1000) / 8 : -1,
  });
  await s.send("Emulation.setCPUThrottlingRate", { rate: on ? 4 : 1 });
}

/** Lo que cada paso tiene a mano además de page y context. */
function makeQa(page: Page) {
  return {
    baseURL,
    pages,
    /** Captura de un momento en que el usuario se confunde, se traba o se molesta. */
    async shot(label: string, p: Page = page) {
      shots++;
      const file = join(opts.dir, `${pad(shots)}-${slug(label)}.png`);
      await p.screenshot({ path: file });
      note("captura", file);
      return file;
    },
    /** Simula la pistola USB: los dígitos y Enter de un tirón. */
    async gun(code: string, p: Page = page) {
      await p.evaluate(async (c) => {
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        for (const key of [...c, "Enter"]) {
          const target = document.activeElement ?? document.body;
          target.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
          );
        }
      }, code);
    },
    camera: {
      /** Pone este código de barras frente a la cámara (hasta que se saque). */
      show: (code: string, p: Page = page) =>
        p.evaluate((c) => {
          (window as unknown as { __qaCamera: { code: string | null } }).__qaCamera.code = c;
        }, code),
      hide: (p: Page = page) =>
        p.evaluate(() => {
          (window as unknown as { __qaCamera: { code: string | null } }).__qaCamera.code = null;
        }),
    },
    /** Corta o devuelve la red (toda la pestaña, incluido el service worker). */
    async offline(on: boolean) {
      await context.setOffline(on);
      for (const p of pages) {
        await p
          .evaluate((o) => window.dispatchEvent(new Event(o ? "offline" : "online")), on)
          .catch(() => {});
      }
    },
    /** 3G lento: 400 ms de latencia, 400 kbps, CPU ×4. */
    slow3g: (on = true, p: Page = page) => throttle(p, on),
    /** El texto que se ve en pantalla, como lo leería una persona. */
    text: (p: Page = page) => p.locator("body").innerText(),
    /** Árbol de accesibilidad: roles, nombres y estados de lo que hay en pantalla. */
    see: (p: Page = page) => p.locator("body").ariaSnapshot(),
    /** Qué contestar a los alert/confirm del navegador. */
    dialogs(answer: "accept" | "dismiss") {
      dialogAnswer = answer;
    },
    /** Abre otra pestaña en el mismo navegador (misma sesión). */
    newPage: () => context.newPage(),
    /** Borra cookies y/o almacenamiento del sitio (sesión vencida, dispositivo nuevo). */
    clearCookies: () => context.clearCookies(),
    clearStorage: (p: Page = page) =>
      p.evaluate(async () => {
        localStorage.clear();
        sessionStorage.clear();
        const dbs = await indexedDB.databases();
        for (const d of dbs) if (d.name) indexedDB.deleteDatabase(d.name);
      }),
    /** Llama a la API desde la página con la sesión actual (cookies y tokens). */
    api: (path: string, init?: { method?: string; body?: unknown }, p: Page = page) =>
      p.evaluate(
        async ({ path, init }) => {
          const headers: Record<string, string> = { "content-type": "application/json" };
          const d = localStorage.getItem("mostrador.deviceToken");
          const t = localStorage.getItem("mostrador.pinToken");
          if (d) headers["x-device-token"] = d;
          if (t) headers.authorization = `Bearer ${t}`;
          const r = await fetch(path, {
            method: init?.method ?? "GET",
            headers,
            body: init?.body === undefined ? undefined : JSON.stringify(init.body),
          });
          const text = await r.text();
          try {
            return { status: r.status, body: JSON.parse(text) };
          } catch {
            return { status: r.status, body: text.slice(0, 2000) };
          }
        },
        { path, init },
      ),
    /** Anotación libre que queda en el registro del paso. */
    log: (text: string) => note("nota", text),
    sleep: (ms: number) => new Promise((r) => setTimeout(r, ms)),
  };
}

type StepBody = { code: string; label: string; page?: number };

async function runStep(body: StepBody) {
  const from = events.length;
  const page = pages[body.page ?? 0] ?? pages[0] ?? first;
  const qa = makeQa(page);
  let result: unknown;
  let error: string | undefined;
  const started = Date.now();
  try {
    const fn = new Function(
      "page",
      "context",
      "qa",
      "expect",
      `return (async () => {\n${body.code}\n})();`,
    ) as (p: Page, c: BrowserContext, q: ReturnType<typeof makeQa>, e: unknown) => Promise<unknown>;
    const { expect } = await import("@playwright/test");
    result = await Promise.race([
      fn(page, context, qa, expect),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("El paso tardó más de 120 s")), 120_000),
      ),
    ]);
  } catch (e) {
    error = e instanceof Error ? `${e.message}` : String(e);
  }
  const n = readStepCount() + 1;
  writeFileSync(join(opts.dir, ".steps"), String(n));
  const shot = join(opts.dir, "pasos", `${String(n).padStart(3, "0")}-${slug(body.label)}.png`);
  const live = pages[body.page ?? 0] ?? pages[0];
  try {
    await live?.screenshot({ path: shot, timeout: 10_000 });
  } catch (e) {
    note("captura", `no se pudo capturar: ${String(e).slice(0, 200)}`);
  }
  let url = "";
  try {
    url = live?.url() ?? "";
  } catch {}
  return {
    ok: !error,
    error,
    result,
    url,
    ms: Date.now() - started,
    shot,
    events: collapse(events.slice(from)),
  };
}

/** Junta los eventos repetidos (la cámara avisa lo mismo diez veces por segundo). */
function collapse(list: Event[]) {
  const out: (Event & { n: number })[] = [];
  for (const e of list) {
    const key = `${e.kind}|${e.text.slice(0, 120)}`;
    const last = out[out.length - 1];
    if (last && `${last.kind}|${last.text.slice(0, 120)}` === key) last.n++;
    else out.push({ ...e, text: e.text.slice(0, 300), n: 1 });
  }
  return out;
}

function readStepCount() {
  try {
    return Number(readFileSync(join(opts.dir, ".steps"), "utf8")) || 0;
  } catch {
    return 0;
  }
}

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname === "/step") {
      const body = (await req.json()) as StepBody;
      const out = await runStep(body);
      return Response.json(out);
    }
    if (url.pathname === "/quit") {
      setTimeout(async () => {
        await context.close().catch(() => {});
        await browser.close().catch(() => {});
        process.exit(0);
      }, 100);
      return new Response("chau");
    }
    return Response.json({ ok: true, baseURL, device: opts.device, pages: pages.length });
  },
});

writeFileSync(
  join(opts.dir, ".driver.json"),
  JSON.stringify({
    port: server.port,
    baseURL,
    device: opts.device,
    slot: opts.slot,
    pid: process.pid,
  }),
);
console.log(
  `driver ${basename(opts.dir)} en http://127.0.0.1:${server.port} → ${baseURL} (${opts.device})`,
);
