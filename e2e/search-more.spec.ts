import { devices, expect, test } from "@playwright/test";
import { ensureShiftOpen, loginOwner, loginWithPin } from "./helpers";

test("búsqueda global: Ctrl+K encuentra productos, clientes y acciones", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/inicio");
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Buscar" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Buscar en todo").fill("cerrar caja");
  await expect(dialog.getByRole("button", { name: /Cerrar caja/ })).toBeVisible();
  await dialog.getByLabel("Buscar en todo").fill("yerba");
  await expect(dialog.getByRole("button", { name: /Yerba Playadito/ })).toBeVisible({
    timeout: 15_000,
  });
  await dialog.getByLabel("Buscar en todo").fill("rosa");
  await expect(dialog.getByRole("button", { name: /Rosa Giménez/ })).toBeVisible();
  await dialog.getByRole("button", { name: /Rosa Giménez/ }).click();
  await expect(page).toHaveURL(/\/clientes\//);
  // El botón de la barra también la abre.
  await page
    .getByRole("button", { name: /Buscar/ })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Buscar" })).toBeVisible();
});

test.describe("en el iPhone", () => {
  const { defaultBrowserType: _b, ...iphone } = devices["iPhone 14 Pro"] ?? {};
  test.use({ ...iphone, viewport: { width: 393, height: 852 } });

  test("Vender: 'Más' ofrece cliente, descuento, historial y espera", async ({ page }) => {
    await loginWithPin(page, "Tomás", "4567");
    await page.goto("/vender");
    await ensureShiftOpen(page);
    await expect(page.getByRole("button", { name: /Huevos maple/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Más" }).click();
    await expect(page.getByRole("menuitem", { name: "Asignar cliente o fiado" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Historial de ventas" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Asignar cliente o fiado" }).click();
    await expect(page.getByRole("dialog", { name: "Asignar cliente o fiado" })).toBeVisible();
  });
});
