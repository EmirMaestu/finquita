import { devices, expect, type Page, test } from "@playwright/test";
import { ensureShiftOpen, loginOwner } from "./helpers";

// Vender con la cámara del iPhone: la cámara es falsa (scripts/qa/camera-init.js reemplaza
// getUserMedia por un canvas que dibuja el EAN-13 que se le pida).
test.use({
  ...devices["iPhone 13"],
  defaultBrowserType: "chromium",
  viewport: { width: 375, height: 812 },
});

const show = (page: Page, code: string | null) =>
  page.evaluate((c) => {
    (window as unknown as { __qaCamera: { code: string | null } }).__qaCamera.code = c;
  }, code);

test("cámara en Vender: avisa cada lectura, muestra lo que va, y cierra para el peso y el código nuevo", async ({
  page,
}) => {
  await page.addInitScript({ path: "scripts/qa/camera-init.js" });
  await loginOwner(page);
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Huevos maple/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Escanear con la cámara" }).click();
  const camera = page.getByRole("button", { name: "Cerrar cámara" });
  await expect(camera).toBeVisible();
  await expect(page.getByRole("status", { name: "Lo que va" })).toHaveText(
    "Todavía no hay nada en la venta",
  );

  // Un producto: aviso y contador sin cerrar la cámara.
  await show(page, "7790000001017");
  await expect(page.getByText("Agregado: Coca-Cola 2,25 L")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("status", { name: "Lo que va" })).toHaveText("1 ítem · $ 4.600");
  await expect(camera).toBeVisible();
  await show(page, null);

  // Un pesable: la cámara se cierra y el teclado de peso se ve.
  await page.waitForTimeout(500);
  await show(page, "2000000010014");
  await expect(page.getByRole("dialog", { name: "Peso de Pan francés" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(camera).toBeHidden();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await show(page, null);

  // Un código que no está cargado: la cámara se cierra y el diálogo se ve.
  await page.getByRole("button", { name: "Escanear con la cámara" }).click();
  await expect(camera).toBeVisible();
  await show(page, "7798765432107");
  await expect(page.getByRole("dialog", { name: /no está cargado/ })).toBeVisible({
    timeout: 10_000,
  });
  await expect(camera).toBeHidden();
});
