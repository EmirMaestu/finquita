import { expect, type Page, test } from "@playwright/test";
import { apiFromPage, ensureShiftOpen, loginWithPin, scanWithGun } from "./helpers";

async function startSale(page: Page) {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByLabel("Escaneá o buscá por nombre")).toBeVisible();
  // El catálogo local ya bajó (los botones rápidos salen de ahí).
  await expect(page.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
}

async function weigh(page: Page, product: RegExp, grams: string) {
  await page.getByRole("button", { name: product }).click();
  const dialog = page.getByRole("dialog", { name: /^Peso de/ });
  await expect(dialog).toBeVisible();
  for (const d of grams) await dialog.getByRole("button", { name: d, exact: true }).click();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
}

test("flujo 1: venta rápida con pistola, total $ 18.550 y vuelto $ 1.450", async ({ page }) => {
  await startSale(page);
  await scanWithGun(page, "7790000001017");
  await scanWithGun(page, "7791234000012");
  await weigh(page, /Pan francés/, "750");
  await weigh(page, /Jamón cocido/, "200");
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 18.550");

  await page.keyboard.press("F12");
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("button", { name: "$ 20.000", exact: true }).click();
  await expect(pay.getByRole("status", { name: "Vuelto" })).toHaveText("$ 1.450");
  await pay.getByRole("button", { name: /Confirmar cobro/ }).click();
  const done = page.getByRole("button", { name: "Venta lista" });
  await expect(done).toContainText("$ 18.550");
  await expect(done).toContainText("Vuelto $ 1.450");
  // Vuelve sola a una venta nueva.
  await expect(done).toBeHidden({ timeout: 5000 });
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 0");
});

test("pago combinado: $ 10.000 en efectivo y el resto con débito; después, un fiado a Rosa", async ({
  page,
}) => {
  await startSale(page);
  await scanWithGun(page, "7790000001017");
  await scanWithGun(page, "7791234000012");
  await weigh(page, /Pan francés/, "750");
  await weigh(page, /Jamón cocido/, "200");
  await page.keyboard.press("F12");
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("button", { name: "$ 10.000", exact: true }).click();
  await pay.getByRole("button", { name: /Agregar pago/ }).click();
  await expect(pay.getByText("Falta").locator("..")).toContainText("$ 8.550");
  await pay.getByRole("button", { name: "Tarjeta" }).click();
  await expect(pay.getByRole("status", { name: "Monto" })).toHaveText("$ 8.550");
  await pay.getByRole("button", { name: /Confirmar cobro/ }).click();
  const done = page.getByRole("button", { name: "Venta lista" });
  await expect(done).toContainText("$ 18.550");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await expect(done).toBeHidden();

  // Fiado dentro del límite: Rosa debe $ 18.400 de $ 30.000.
  await scanWithGun(page, "7791234000012");
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 6.900");
  await page.keyboard.press("F5");
  const picker = page.getByRole("dialog", { name: "Asignar cliente o fiado" });
  await picker.getByLabel("Buscar cliente").fill("rosa");
  await picker.getByRole("button", { name: /Rosa Giménez/ }).click();
  await expect(page.getByRole("complementary", { name: "Total" })).toContainText("Rosa Giménez");
  await page.keyboard.press("F12");
  await pay.getByRole("button", { name: "Fiado" }).click();
  await expect(pay).toContainText("después $ 25.300");
  await pay.getByRole("button", { name: /Confirmar cobro/ }).click();
  await expect(page.getByRole("button", { name: "Venta lista" })).toContainText("$ 6.900");

  type Shift = { summary: { byMethod: Record<string, { amountCents: number; count: number }> } };
  type Reg = { openShift: { id: string } | null };
  await expect
    .poll(
      async () => {
        const [reg] = await apiFromPage<Reg[]>(page, "/api/registers");
        const s = await apiFromPage<Shift>(page, `/api/shifts/${reg?.openShift?.id}`);
        return s.summary.byMethod.account?.amountCents ?? 0;
      },
      { timeout: 25_000 },
    )
    .toBe(690_000);
  const [reg] = await apiFromPage<Reg[]>(page, "/api/registers");
  const s = await apiFromPage<Shift>(page, `/api/shifts/${reg?.openShift?.id}`);
  expect(s.summary.byMethod.debit?.amountCents).toBe(855_000);
});
