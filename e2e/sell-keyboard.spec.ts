import { expect, test } from "@playwright/test";
import { apiFromPage, ensureShiftOpen, loginWithPin } from "./helpers";

test("vende 4 productos usando solo el teclado", async ({ page }) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  const search = page.getByLabel("Escaneá o buscá por nombre");
  await expect(search).toBeVisible();
  await search.focus();

  const add = async (text: string, name: RegExp) => {
    await page.keyboard.type(text, { delay: 80 });
    await expect(
      page.getByRole("list", { name: "Resultados" }).getByRole("button", { name }).first(),
    ).toBeVisible();
    await page.keyboard.press("Enter");
  };

  await add("yerba", /Yerba Playadito/);
  await add("coca", /Coca-Cola/);
  // "2 *" multiplica lo próximo que se agrega.
  await page.keyboard.type("2", { delay: 80 });
  await page.keyboard.press("*");
  await add("aceite", /Aceite de girasol/);
  await add("fideos", /Fideos tirabuzón/);
  // + suma uno al ítem elegido (el último agregado).
  await page.keyboard.press("+");

  const lines = page.getByRole("list", { name: "Líneas de la venta" });
  await expect(lines.getByRole("listitem")).toHaveCount(4);
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 26.100");

  // F12 abre el cobro; se tipea lo que entrega el cliente y Enter confirma.
  await page.keyboard.press("F12");
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await expect(pay).toBeVisible();
  await page.keyboard.type("30000", { delay: 90 });
  await expect(pay.getByRole("status", { name: "Vuelto" })).toHaveText("$ 3.900");
  await page.keyboard.press("Enter");

  const done = page.getByRole("button", { name: "Venta lista" });
  await expect(done).toContainText("Vuelto $ 3.900");
  await page.keyboard.press("Space");
  await expect(done).toBeHidden();
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 0");

  // La venta llegó al servidor, una sola vez.
  type Reg = { openShift: { id: string } | null; lastSaleNumber: number };
  await expect
    .poll(async () => (await apiFromPage<Reg[]>(page, "/api/registers"))[0]?.lastSaleNumber, {
      timeout: 25_000,
    })
    .toBeGreaterThanOrEqual(1);
  const [reg] = await apiFromPage<Reg[]>(page, "/api/registers");
  const shift = await apiFromPage<{
    summary: { salesCents: number; byMethod: { cash: { count: number } } };
  }>(page, `/api/shifts/${reg?.openShift?.id}`);
  expect(shift.summary.salesCents).toBe(2_610_000);
  expect(shift.summary.byMethod.cash.count).toBe(1);
});
