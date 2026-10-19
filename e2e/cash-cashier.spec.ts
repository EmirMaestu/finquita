import { expect, test } from "@playwright/test";
import { ensureShiftOpen, loginWithPin, scanWithGun } from "./helpers";

test("el cajero vende, va a Caja desde Vender y cierra el turno con su nombre", async ({
  page,
}) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
  await scanWithGun(page, "7790000001017");
  await page.keyboard.press("F12");
  await page.keyboard.press("Enter");
  const done = page.getByRole("button", { name: "Venta lista" });
  await expect(done).toBeVisible();
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await expect(done).toBeHidden();

  // Desde el mostrador hay salida a Caja: el chip de la caja y "Salir del modo mostrador".
  await page.getByRole("button", { name: /ir a Caja/ }).click();
  await expect(page).toHaveURL(/\/caja$/);
  await expect(page.getByRole("region", { name: "Efectivo esperado" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Arqueo y cierre" }).click();
  await expect(page.getByRole("heading", { name: /Arqueo y cierre/ })).toBeVisible();

  // Un monto que no se entiende se marca en su campo y no deja ver el resultado.
  const debit = page.getByLabel("Débito (posnet)");
  await debit.fill("abc");
  await expect(page.getByText("Poné un monto, por ejemplo 12500")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver resultado" })).toBeDisabled();
  await debit.fill("");

  // Lo contado sobrevive una recarga.
  await page.getByRole("button", { name: "Sumar billetes de $ 20.000" }).click();
  await expect(page.getByRole("status", { name: "Efectivo contado" })).toHaveText("$ 20.000");
  await page.reload();
  await expect(page.getByRole("status", { name: "Efectivo contado" })).toHaveText("$ 20.000", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Ver resultado" }).click();
  const note = page.getByLabel(/Comentario/);
  if (await note.isVisible()) await note.fill("Prueba de cierre");
  const close = page.getByRole("button", { name: /Cerrar turno/ });
  await expect(close).toContainText("avisar al dueño");
  await close.click();
  await expect(page.getByText("CIERRE DE CAJA")).toBeVisible();
  await expect(page.getByText(/Cajero: Tomás/)).toBeVisible();
});
