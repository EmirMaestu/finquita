import { expect, type Page, test } from "@playwright/test";
import { ensureShiftOpen, loginWithPin, scanWithGun } from "./helpers";

/** Si el turno lo abrió otra persona (otro test), cerrarlo pide el PIN de un encargado o del dueño. */
async function authorizeIfAsked(page: Page) {
  const pin = page.getByRole("dialog", { name: "Autorizá con tu PIN" });
  if (
    await pin.waitFor({ state: "visible", timeout: 2500 }).then(
      () => true,
      () => false,
    )
  ) {
    for (const d of "1234") await pin.getByRole("button", { name: d, exact: true }).click();
  }
}

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
  // Con teclado (ronda 3): en Caja el foco está en "Arqueo y cierre" y Enter entra al cierre,
  // con el foco en el primer billete.
  await expect(page.getByRole("button", { name: /Arqueo y cierre/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: /Arqueo y cierre/ })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /^billetes de/ }).first()).toBeFocused();

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

  // Enter en un billete muestra el resultado (con el turno ya cargado); la diferencia lleva un
  // solo signo.
  await expect(page.getByRole("button", { name: /Ver resultado/ })).toBeEnabled({
    timeout: 20_000,
  });
  await page
    .getByRole("textbox", { name: /^billetes de/ })
    .first()
    .press("Enter");
  const result = page.getByRole("region", { name: "Resultado" });
  await expect(result).toBeVisible();
  await expect(result.getByRole("row", { name: /Efectivo/ })).not.toContainText(/[−-]\s*[−-]/);
  const note = page.getByLabel(/Comentario/);
  await expect(note).toBeFocused();
  await note.fill("Prueba de cierre");
  const close = page.getByRole("button", { name: /Cerrar turno/ });
  await expect(close).toContainText("avisar al dueño");
  // Enter en el comentario cierra.
  await note.press("Enter");
  await authorizeIfAsked(page);
  await expect(page.getByText("CIERRE DE CAJA")).toBeVisible();
  await expect(page.getByText(/Cajero: Tomás|Cerró: Tomás/)).toBeVisible();
});

test("abrir la caja con un fondo negativo no deja una caja fantasma", async ({ page }) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/caja");
  const open = page.getByRole("region", { name: "Abrir turno" });
  const closeBtn = page.getByRole("button", { name: "Arqueo y cierre" });
  await expect(open.or(closeBtn).first()).toBeVisible({ timeout: 20_000 });
  // Si el turno anterior quedó abierto por otro test, se cierra primero.
  if (!(await open.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Arqueo y cierre" }).click();
    await page.getByRole("button", { name: "Ver resultado" }).click();
    const note = page.getByLabel(/Comentario/);
    if (await note.isVisible()) await note.fill("Cierre para la prueba");
    await page.getByRole("button", { name: /Cerrar turno/ }).click();
    await authorizeIfAsked(page);
    await expect(page.getByText("CIERRE DE CAJA")).toBeVisible();
    await page.goto("/caja");
  }
  await expect(open).toBeVisible({ timeout: 20_000 });
  await open.getByRole("button", { name: "Total directo" }).click();
  await open.getByLabel("Fondo inicial").fill("-500");
  const comment = open.getByLabel("Comentario");
  if (await comment.isVisible().catch(() => false)) await comment.fill("Prueba");
  await open.getByRole("button", { name: /^Abrir turno/ }).click();
  await expect(open.getByRole("alert")).toHaveText("El fondo no puede ser negativo.");
  // Sigue cerrada: la pantalla no dio por hecho lo que el servidor iba a rechazar.
  await expect(open).toBeVisible();
  await expect(page.getByText("Caja cerrada").first()).toBeVisible();
});
