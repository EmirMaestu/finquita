import { expect, type Page } from "@playwright/test";
import { E2E } from "./env";

/** El dueño entra con email y contraseña. */
export async function loginOwner(page: Page) {
  await page.goto("/");
  await page.getByLabel("Email").fill(E2E.owner.email);
  await page.getByLabel("Contraseña").fill(E2E.owner.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("navigation", { name: "Módulos" })).toBeVisible();
}

/** La Mac del mostrador ya está habilitada: entra alguien con su PIN. */
export async function loginWithPin(page: Page, name: string, pin: string) {
  await page.addInitScript(
    (token) => localStorage.setItem("mostrador.deviceToken", token),
    E2E.macToken,
  );
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(`^${name.charAt(0)} ${name} `) }).click();
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  // El cajero entra directo a Vender (modo mostrador, sin la barra de módulos).
  await expect(
    page
      .getByRole("navigation", { name: "Módulos" })
      .or(page.getByLabel("Escaneá o buscá por nombre"))
      .first(),
  ).toBeVisible();
}

/**
 * Simula la pistola USB: los dígitos y Enter de un tirón, como los manda el lector
 * (con keyboard.type de Playwright cada tecla espera la respuesta del navegador).
 */
export async function scanWithGun(page: Page, code: string) {
  await page.evaluate(async (c) => {
    // Primero, que la página termine de pintar: con el hilo ocupado, los eventos de la prueba
    // salen espaciados (la pistola real no tiene ese problema: el sistema les pone la hora).
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    for (const key of [...c, "Enter"]) {
      const target = document.activeElement ?? document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
  }, code);
}

/** Llama a la API desde la página, con los tokens del dispositivo y del PIN. */
export async function apiFromPage<T = unknown>(page: Page, path: string): Promise<T> {
  return page.evaluate(async (p) => {
    const headers: Record<string, string> = {};
    const d = localStorage.getItem("mostrador.deviceToken");
    const t = localStorage.getItem("mostrador.pinToken");
    if (d) headers["x-device-token"] = d;
    if (t) headers.authorization = `Bearer ${t}`;
    const r = await fetch(p, { headers });
    return r.json();
  }, path) as Promise<T>;
}

/** Abre el turno de caja si está cerrado (fondo tipeado directo). */
export async function ensureShiftOpen(page: Page, floatPesos = "20000") {
  const open = page.getByRole("region", { name: "Abrir turno" });
  const search = page.getByLabel("Escaneá o buscá por nombre");
  const shiftView = page.getByRole("region", { name: "Efectivo esperado" });
  await expect(open.or(search).or(shiftView).first()).toBeVisible({ timeout: 20_000 });
  if (await open.isVisible().catch(() => false)) {
    await open.getByRole("button", { name: "Total directo" }).click();
    await open.getByLabel("Fondo inicial").fill(floatPesos);
    const comment = open.getByLabel("Comentario");
    if (await comment.isVisible().catch(() => false)) await comment.fill("Prueba");
    await open.getByRole("button", { name: /^Abrir turno/ }).click();
  }
}
