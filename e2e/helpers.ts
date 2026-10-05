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
  await page.getByRole("button", { name: new RegExp(`^${name.charAt(0)}${name}`) }).click();
  for (const d of pin) await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Módulos" })).toBeVisible();
}
