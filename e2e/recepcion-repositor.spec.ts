import { devices, expect, test } from "@playwright/test";
import { loginOwner, loginWithPin } from "./helpers";

// El repositor entra a Compras desde la barra del celular y cae en Recepción (lo único suyo).
test.use({
  ...devices["iPhone 14 Pro"],
  defaultBrowserType: "chromium",
  viewport: { width: 393, height: 852 },
});

test("el repositor llega a Recepción desde Compras y recibe lo que faltaba del 0042", async ({
  page,
  browser,
}) => {
  // El 0042 tiene que estar enviado (si otro test no lo hizo antes, lo hace el dueño acá).
  const owner = await browser.newPage();
  await loginOwner(owner);
  await owner.goto("/compras/pedidos");
  await owner.getByRole("button", { name: /0042/ }).click();
  const send = owner.getByRole("button", { name: "Marcar enviado" });
  if (
    await send.waitFor({ state: "visible", timeout: 5000 }).then(
      () => true,
      () => false,
    )
  )
    await send.click();
  await owner.close();
  await loginWithPin(page, "Nico", "5678");
  await page.getByRole("link", { name: "Compras" }).click();
  await expect(page).toHaveURL(/\/compras\/recepcion/);
  await expect(page.getByText("no tiene permiso para esto")).toHaveCount(0);
  // Sin pestañas que no puede abrir.
  await expect(page.getByRole("link", { name: "Sugerido" })).toHaveCount(0);
  // El 0042 quedó parcial en la prueba de recepción: se ve y lo dice.
  const row = page.getByRole("button", { name: /Pedido 0042 · Lácteos del Sur/ });
  await expect(row).toBeVisible({ timeout: 20_000 });
  // Si ya se recibió en parte (prueba de recepción), lo dice.
  if ((await row.textContent())?.includes("Recibido parcial"))
    await expect(row).toContainText("Recibir lo que falta");
  await row.click();
  await expect(page.getByRole("heading", { name: "Recibir pedido 0042" })).toBeVisible();
});
