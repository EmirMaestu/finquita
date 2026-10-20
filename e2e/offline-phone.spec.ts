import { devices, expect, test } from "@playwright/test";
import { ensureShiftOpen, loginOwner } from "./helpers";

// El dueño, en el iPhone, se queda sin internet en medio de una venta y de una recepción.
test.use({
  ...devices["iPhone 13"],
  defaultBrowserType: "chromium",
  viewport: { width: 375, height: 812 },
});

test("sin internet en el iPhone: el chip cuenta la venta pendiente y la recepción confirma al instante", async ({
  page,
  context,
}) => {
  await loginOwner(page);
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Huevos maple/ })).toBeVisible({
    timeout: 20_000,
  });
  // Que la copia local tenga el catálogo y el service worker controle la página.
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), {
      timeout: 20_000,
    })
    .toBe(true);
  await page.getByRole("button", { name: /Huevos maple/ }).click();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await expect(page.getByRole("status", { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole("button", { name: /Cobrar/ }).click();
  await page
    .getByRole("dialog", { name: "Cobrar" })
    .getByRole("button", { name: /Confirmar cobro/ })
    .click();
  const done = page.getByRole("button", { name: "Venta lista" });
  await expect(done).toBeVisible();
  await done.click();
  await expect(done).toBeHidden();
  // Sigue sin internet: el chip lo dice y cuenta la venta por sincronizar.
  await expect(
    page.getByRole("status", { name: "Sin conexión · 1 venta por sincronizar" }),
  ).toBeVisible({
    timeout: 10_000,
  });

  // Recibir sin pedido, sin internet: confirma al instante y lo dice.
  await page.goto("/compras/recepcion?tipo=no_order");
  await expect(page.getByText("Recibir sin pedido").first()).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Buscar producto").fill("yerba");
  await page
    .getByRole("button", { name: /Yerba Playadito/ })
    .first()
    .click();
  await page.getByLabel("Recibido Yerba Playadito 1 kg").fill("6");
  await page.getByRole("button", { name: "Listo" }).click();
  const started = Date.now();
  await page.getByRole("button", { name: "Confirmar recepción" }).click();
  const confirmAnyway = page.getByRole("button", { name: "Confirmar igual" });
  if (await confirmAnyway.isVisible({ timeout: 800 }).catch(() => false))
    await confirmAnyway.click();
  await expect(page.getByText(/Recepción guardada en el dispositivo/)).toBeVisible({
    timeout: 5000,
  });
  expect(Date.now() - started).toBeLessThan(4000);

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status", { name: "Todo sincronizado" })).toBeVisible({
    timeout: 30_000,
  });
});
