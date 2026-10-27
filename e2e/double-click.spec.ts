import { expect, type Page, test } from "@playwright/test";
import { apiFromPage, loginOwner } from "./helpers";

type Product = { id: string; name: string; stockQty: number };

async function stockOf(page: Page, name: RegExp): Promise<number> {
  const r = await apiFromPage<Product[] | { items: Product[] }>(
    page,
    `/api/products?q=${encodeURIComponent(name.source.split(" ")[0] ?? "")}`,
  );
  const list = Array.isArray(r) ? r : r.items;
  const p = list.find((x) => name.test(x.name));
  if (!p) throw new Error(`No está ${name}`);
  return p.stockQty;
}

test("doble clic en Ajustar stock: un solo ajuste", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/productos");
  const before = await stockOf(page, /Coca-Cola/);
  await page.getByRole("row", { name: /Coca-Cola 2,25 L/ }).click();
  const panel = page.getByRole("complementary", { name: "Ficha del producto" });
  await panel.getByRole("button", { name: "Ajustar stock" }).click();
  const sheet = page.getByRole("dialog", { name: /Ajustar stock/ });
  await sheet.getByRole("button", { name: "Entra" }).click();
  await sheet.getByLabel("Cantidad").fill("10");
  await sheet.getByRole("button", { name: "Ajustar" }).dblclick();
  await expect(page.getByText("Stock ajustado")).toBeVisible();
  await expect.poll(() => stockOf(page, /Coca-Cola/), { timeout: 25_000 }).toBe(before + 10);
  // Y sigue igual un rato después: no llegó un segundo ajuste.
  await page.waitForTimeout(2500);
  expect(await stockOf(page, /Coca-Cola/)).toBe(before + 10);
});

test("doble clic en Confirmar recepción: el stock entra una sola vez", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/compras/recepcion");
  const before = await stockOf(page, /Aceite de girasol/);
  await page.getByRole("button", { name: /Pedido 0041/ }).click();
  await expect(page.getByRole("heading", { name: "Recibir pedido 0041" })).toBeVisible();
  // El pedido 0041 del escenario pide 12 aceites.
  const ordered = 12;
  await page.getByRole("button", { name: "Llegó todo como el pedido" }).click();
  await page.getByRole("button", { name: "Confirmar recepción" }).dblclick();
  const confirmAnyway = page.getByRole("button", { name: "Confirmar igual" });
  if (await confirmAnyway.isVisible({ timeout: 1500 }).catch(() => false))
    await confirmAnyway.click();
  await expect(page.getByText("Recepción confirmada: entró el stock")).toBeVisible();
  await expect
    .poll(() => stockOf(page, /Aceite de girasol/), { timeout: 25_000 })
    .toBe(before + ordered);
  await page.waitForTimeout(2500);
  expect(await stockOf(page, /Aceite de girasol/)).toBe(before + ordered);
});
