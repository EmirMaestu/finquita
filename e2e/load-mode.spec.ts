import { expect, test } from "@playwright/test";
import { loginOwner, scanWithGun } from "./helpers";

test("Modo carga: la pistola pone el código y se carga en serie", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/productos/carga");
  await expect(page.getByRole("heading", { name: "Modo carga" })).toBeVisible();
  // Esperar a que la copia local tenga el catálogo (para reconocer lo ya cargado).
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const dbs = await indexedDB.databases();
        return dbs.some((d) => d.name === "mostrador");
      }),
    )
    .toBe(true);

  const scan = (code: string) => scanWithGun(page, code);

  // Primer producto: código nuevo.
  await scan("7790895000782");
  const form = page.getByRole("region", { name: "Producto a cargar" });
  await expect(form).toContainText("7790895000782");
  await expect(form.getByLabel("Nombre")).toBeFocused();
  await page.keyboard.type("Galletitas de agua 200 g");
  await form.getByLabel("Precio").fill("1500");
  await form.getByLabel("Precio").press("Enter");
  await expect(page.getByRole("region", { name: "Cargados ahora" })).toContainText(
    "Galletitas de agua 200 g",
  );

  // Segundo, enseguida.
  await scan("7790895000799");
  await expect(form).toContainText("7790895000799");
  await page.keyboard.type("Galletitas dulces 300 g");
  await form.getByLabel("Precio").fill("2100");
  await form.getByLabel("Stock inicial").fill("6");
  await form.getByLabel("Precio").press("Enter");
  await expect(page.getByRole("region", { name: "Cargados ahora" })).toContainText(
    "Cargados ahora · 2",
  );

  // Un código que ya está cargado no se duplica.
  await expect
    .poll(async () => (await page.evaluate(() => indexedDB.databases())).length)
    .toBeGreaterThan(0);
  await page.waitForTimeout(500);
  await scan("7791234000012");
  await expect(form).toContainText("Ese código ya está cargado");
  await expect(form).toContainText("Yerba Playadito 1 kg");

  // Los dos llegaron al servidor.
  await expect
    .poll(async () => (await (await page.request.get("/api/products?q=Galletitas")).json()).total, {
      timeout: 25_000,
    })
    .toBe(2);
  const dulces = await (await page.request.get("/api/barcodes/7790895000799")).json();
  expect(dulces).toMatchObject({
    name: "Galletitas dulces 300 g",
    priceCents: 210_000,
    stockQty: 6,
  });
});
