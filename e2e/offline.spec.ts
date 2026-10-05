import { expect, test } from "@playwright/test";
import { apiFromPage, ensureShiftOpen, loginWithPin, scanWithGun } from "./helpers";

type Reg = { openShift: { id: string } | null; lastSaleNumber: number };
type Sale = { id: string; number: number; totalCents: number };

test("venta sin conexión de punta a punta: 3 ventas quedan en el servidor una sola vez", async ({
  page,
  context,
}) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  // El catálogo, los clientes y el contador ya están en el dispositivo.
  await expect(page.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
  const before = (await apiFromPage<Reg[]>(page, "/api/registers"))[0]?.lastSaleNumber ?? 0;
  await page.waitForTimeout(500);

  // El service worker ya controla la página (la app abre sin internet).
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), {
      timeout: 20_000,
    })
    .toBe(true);

  // Se corta internet y hasta se recarga la página: la app sigue andando.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("Escaneá o buscá por nombre")).toBeVisible({ timeout: 20_000 });

  const sell = async (code: string, total: string) => {
    await scanWithGun(page, code);
    await expect(page.getByRole("status", { name: "Total" })).toHaveText(total);
    await page.keyboard.press("F12");
    await page
      .getByRole("dialog", { name: "Cobrar" })
      .getByRole("button", { name: /Confirmar cobro/ })
      .click();
    const done = page.getByRole("button", { name: "Venta lista" });
    await expect(done).toBeVisible();
    await page.waitForTimeout(200);
    await page.keyboard.press("Space");
    await expect(done).toBeHidden();
  };
  await sell("7790000001017", "$ 4.600");
  await sell("7791234000012", "$ 6.900");
  await sell("7790000003028", "$ 1.900");

  const chip = page.getByRole("status", { name: /Sin conexión/ });
  await expect(chip).toHaveText("Sin conexión · 3 ventas por sincronizar", { timeout: 30_000 });

  // Vuelve internet: se sincroniza sola.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("status", { name: /Todo sincronizado|En línea/ })).toBeVisible({
    timeout: 30_000,
  });

  await expect
    .poll(async () => (await apiFromPage<Reg[]>(page, "/api/registers"))[0]?.lastSaleNumber, {
      timeout: 30_000,
    })
    .toBe(before + 3);
  const sales = await apiFromPage<Sale[]>(page, "/api/sales?limit=500");
  const mine = sales.filter((s) => s.number > before);
  expect(mine.map((s) => s.totalCents).sort()).toEqual([190_000, 460_000, 690_000]);
  expect(new Set(mine.map((s) => s.number)).size).toBe(3);

  // Una sincronización más no duplica nada.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForTimeout(2000);
  const again = (await apiFromPage<Sale[]>(page, "/api/sales?limit=500")).filter(
    (s) => s.number > before,
  );
  expect(again).toHaveLength(3);
});
