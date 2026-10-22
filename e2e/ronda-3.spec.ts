import { expect, test } from "@playwright/test";
import { ensureShiftOpen, loginOwner, loginWithPin, scanWithGun } from "./helpers";

// Lo que quedó abierto de la ronda 3 de QA con usuarios (T67).

test("pedido sugerido: cantidades marcadas en su campo y aviso del borrador del mismo proveedor", async ({
  page,
}) => {
  await loginOwner(page);
  await page.goto("/compras/sugerido");
  const chips = page.getByRole("navigation", { name: "Proveedores" }).getByRole("button");
  await chips.first().click();
  await expect(page).toHaveURL(/proveedor=/);
  const supplierUrl = page.url();
  const first = page.getByRole("textbox", { name: /^Pedir / }).first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  const draft = page.getByRole("button", { name: "Guardar borrador" });

  await first.fill("-5");
  await expect(page.getByText("No puede ser negativa").first()).toBeVisible();
  await expect(draft).toBeDisabled();
  await first.fill("999999");
  await expect(page.getByText("Hasta 100.000").first()).toBeVisible();
  await expect(draft).toBeDisabled();

  await first.fill("1");
  await expect(draft).toBeEnabled();
  await draft.click();
  await expect(page).toHaveURL(/\/compras\/pedidos\/[0-9a-f-]+/);

  // El sugerido del mismo proveedor avisa que ya hay un borrador.
  await page.goto(supplierUrl);
  await expect(page.getByRole("status").filter({ hasText: /Ya tenés .*en borrador/ })).toBeVisible({
    timeout: 20_000,
  });
});

test("recepción con palabras: lo pedido y lo que llegó", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/compras/recepcion");
  await page
    .getByRole("button", { name: /Pedido \d+ · / })
    .first()
    .click();
  const list = page.getByRole("list", { name: "Productos de la recepción" });
  await expect(list).toBeVisible({ timeout: 20_000 });
  await expect(list).toContainText(/Pedido \d+.*· falta contar/);
  await expect(list).not.toContainText("→");
});

test('"* 99999" tipeado rápido no abre el alta y dice el tope', async ({ page }) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  const search = page.getByLabel("Escaneá o buscá por nombre");
  await expect(search).toBeVisible({ timeout: 20_000 });
  await scanWithGun(page, "7790000001017");
  await expect(page.getByRole("button", { name: /Pan francés|Coca|Yerba/ }).first()).toBeVisible();
  await search.focus();
  await page.keyboard.type("*99999");
  await page.keyboard.press("Enter");
  await expect(page.getByText("La cantidad va de 1 a 999")).toBeVisible();
  await expect(page.getByRole("dialog", { name: /no está cargado/ })).toHaveCount(0);
  // "1,5 *" tampoco se ignora en silencio.
  await page.keyboard.type("1,5*");
  await expect(page.getByText("Para multiplicar, un número entero de 1 a 999")).toBeVisible();
});

test("sesión con PIN vencida en la Mac: pide el PIN y lo editado sigue ahí", async ({ page }) => {
  await loginWithPin(page, "Carlos Díaz", "1234");
  await page.goto("/productos");
  await page.getByLabel("Buscar productos").fill("Yerba Playadito");
  await page
    .getByRole("row", { name: /Yerba Playadito 1 kg/ })
    .first()
    .click();
  const panel = page.getByRole("complementary", { name: "Ficha del producto" });
  await panel.getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar producto" });
  const price = edit.getByLabel("Precio de venta");
  const before = await price.inputValue();
  await price.fill(before);
  await page.evaluate(() => localStorage.removeItem("mostrador.pinToken"));
  await edit.getByRole("button", { name: "Guardar" }).click();
  // Aparece "¿Quién sos?" sola: se vuelve a poner el PIN sin perder lo cargado.
  await expect(page.getByRole("heading", { name: "¿Quién sos?" })).toBeVisible();
  await page.getByRole("button", { name: /^C Carlos Díaz / }).click();
  for (const d of "1234") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("heading", { name: "¿Quién sos?" })).toBeHidden();
  await expect(price).toHaveValue(before);
  await edit.getByRole("button", { name: "Guardar" }).click();
  await expect(edit).toBeHidden();
});

test('"Entrar con email" desde Cambiar de usuario va directo al login', async ({ page }) => {
  await loginWithPin(page, "Nico", "5678");
  await page.goto("/productos");
  await page.getByRole("button", { name: /^Usuario: / }).click();
  await page.getByRole("menuitem", { name: "Cambiar de usuario" }).click();
  await expect(page.getByRole("heading", { name: "¿Quién sos?" })).toBeVisible();
  await page.getByRole("button", { name: "Entrar con email" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
});
