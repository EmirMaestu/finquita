import { devices, expect, type Page, test } from "@playwright/test";
import { loginWithPin } from "./helpers";

// Productos en el iPhone: el repositor llega a Modo carga desde "Más acciones" y carga con la cámara.
test.use({
  ...devices["iPhone 14 Pro"],
  defaultBrowserType: "chromium",
  viewport: { width: 393, height: 852 },
});

const show = (page: Page, code: string | null) =>
  page.evaluate((c) => {
    (window as unknown as { __qaCamera: { code: string | null } }).__qaCamera.code = c;
  }, code);

test("el repositor abre Modo carga desde Productos y carga un producto con la cámara", async ({
  page,
}) => {
  await page.addInitScript({ path: "scripts/qa/camera-init.js" });
  await loginWithPin(page, "Nico", "5678");
  await page.goto("/productos");
  await page.getByRole("button", { name: "Más acciones" }).click();
  await expect(page.getByRole("menuitem", { name: "Movimientos de stock" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Modo carga" }).click();
  await expect(page.getByRole("heading", { name: "Modo carga" })).toBeVisible();
  await page.getByRole("button", { name: "Abrir la cámara" }).click();
  await expect(page.getByRole("button", { name: "Cerrar cámara" })).toBeVisible();
  const code = `779${String(Date.now()).slice(-9)}`;
  // Un EAN-13 válido: se completa el dígito verificador.
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  const ean = code + String((10 - (sum % 10)) % 10);
  await show(page, ean);
  const form = page.getByRole("region", { name: "Producto a cargar" });
  await expect(form.getByLabel("Nombre")).toBeVisible({ timeout: 10_000 });
  await show(page, null);
  await form.getByLabel("Nombre").fill("Galletitas surtidas 300 g");
  await form.getByLabel("Precio").fill("2100");
  await form.getByRole("button", { name: "Guardar y escanear otro" }).click();
  await expect(page.getByText("Cargado: Galletitas surtidas 300 g")).toBeVisible();
  // La cámara vuelve sola para el próximo.
  await expect(page.getByRole("button", { name: "Cerrar cámara" })).toBeVisible();
});

test("en el celular, Nuevo producto tiene nombre y cámara para el código", async ({ page }) => {
  await page.addInitScript({ path: "scripts/qa/camera-init.js" });
  await loginWithPin(page, "Carlos Díaz", "1234");
  await page.goto("/productos");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const form = page.getByRole("dialog", { name: "Nuevo producto" });
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Escanear el código con la cámara" }).click();
  await show(page, "7790000009990");
  await expect(form.getByLabel("Códigos de barras")).toHaveValue("7790000009990", {
    timeout: 10_000,
  });
});
