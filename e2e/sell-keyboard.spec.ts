import { expect, test } from "@playwright/test";
import { apiFromPage, ensureShiftOpen, loginWithPin, scanWithGun } from "./helpers";

test("vende 4 productos usando solo el teclado", async ({ page }) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  const search = page.getByLabel("Escaneá o buscá por nombre");
  await expect(search).toBeVisible();
  // Lo que ya vendió el turno (otros tests pueden haber vendido antes).
  type Reg = { openShift: { id: string } | null; lastSaleNumber: number };
  type Shift = { summary: { salesCents: number; byMethod: { cash: { count: number } } } };
  const before = await (async () => {
    // El turno recién abierto viaja por la cola: se espera a que el servidor lo tenga.
    await expect
      .poll(async () => (await apiFromPage<Reg[]>(page, "/api/registers"))[0]?.openShift?.id, {
        timeout: 20_000,
      })
      .toBeTruthy();
    const [r] = await apiFromPage<Reg[]>(page, "/api/registers");
    const s = await apiFromPage<Shift>(page, `/api/shifts/${r?.openShift?.id}`);
    return {
      number: r?.lastSaleNumber ?? 0,
      sales: s.summary.salesCents,
      cash: s.summary.byMethod.cash.count,
    };
  })();
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
  await expect
    .poll(async () => (await apiFromPage<Reg[]>(page, "/api/registers"))[0]?.lastSaleNumber, {
      timeout: 25_000,
    })
    .toBe(before.number + 1);
  const [reg] = await apiFromPage<Reg[]>(page, "/api/registers");
  const shift = await apiFromPage<Shift>(page, `/api/shifts/${reg?.openShift?.id}`);
  expect(shift.summary.salesCents - before.sales).toBe(2_610_000);
  expect(shift.summary.byMethod.cash.count - before.cash).toBe(1);
});

test("cobro combinado solo con teclado: Enter sobre Tarjeta la elige, no cobra en efectivo", async ({
  page,
}) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
  await scanWithGun(page, "7790000001017");
  await scanWithGun(page, "7791234000012");
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 11.500");

  await page.keyboard.press("F12");
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await expect(pay).toBeVisible();
  await page.keyboard.type("5000", { delay: 90 });
  await page.keyboard.press("Enter");
  await expect(pay.getByText("Falta").locator("..")).toContainText("$ 6.500");

  // Llegar con Tab hasta "Tarjeta" y apretar Enter elige Tarjeta (antes cobraba todo en efectivo).
  const card = pay.getByRole("button", { name: "Tarjeta" });
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Venta lista" })).toBeHidden();
  await expect(pay.getByRole("status", { name: "Monto" })).toHaveText("$ 6.500");
  // Y también con la letra: Q elige Transferencia o QR, T vuelve a Tarjeta.
  await page.keyboard.press("q");
  await expect(pay.getByRole("button", { name: "Transferencia o QR" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("t");
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+Enter");
  const done = page.getByRole("button", { name: "Venta lista" });
  await expect(done).toContainText("$ 11.500");
  await page.waitForTimeout(200);
  await page.keyboard.press("Space");
  await expect(done).toBeHidden();

  type Sale = { number: number; totalCents: number; methods: string[] };
  await expect
    .poll(
      async () => {
        const list = await apiFromPage<Sale[]>(page, "/api/sales?limit=1");
        return list[0]?.methods?.slice().sort().join("+");
      },
      { timeout: 25_000 },
    )
    .toBe("cash+debit");
});

test("la tecla que cierra la pantalla verde llega a la venta nueva: '2 *' multiplica", async ({
  page,
}) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
  await scanWithGun(page, "7790000003028");
  await page.keyboard.press("F12");
  await page.keyboard.press("Enter");
  const done = page.getByRole("button", { name: "Venta lista" });
  await expect(done).toBeVisible();
  await page.waitForTimeout(250);
  // Sobre la pantalla verde se tipea "2" y "*": el 2 no se pierde.
  await page.keyboard.press("2");
  await expect(done).toBeHidden();
  await page.keyboard.press("*");
  await scanWithGun(page, "7791234000012");
  const line = page.getByRole("list", { name: "Líneas de la venta" }).getByRole("listitem");
  await expect(line).toHaveCount(1);
  await expect(line.first()).toContainText("2");
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 13.800");
});

test("código no cargado: F3 adentro del diálogo vende como varios", async ({ page }) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
  await scanWithGun(page, "7798765432107");
  await expect(page.getByRole("dialog", { name: /no está cargado/ })).toBeVisible();
  await page.keyboard.press("F3");
  await expect(page.getByRole("dialog", { name: "Producto varios" })).toBeVisible();
});

test("efectivo rápido con el teclado: Ctrl+3 suma $ 10.000", async ({ page }) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
  await scanWithGun(page, "7790000001017");
  await page.keyboard.press("F12");
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await expect(pay).toBeVisible();
  await page.keyboard.press("Control+3");
  await expect(pay.getByRole("status", { name: "Monto" })).toHaveText("$ 10.000");
  await page.keyboard.press("Escape");
});

test("Enter abre la línea elegida: descuento a ese producto y nota (T62)", async ({ page }) => {
  await loginWithPin(page, "Tomás", "4567");
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
  await scanWithGun(page, "7790000001017");
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 4.600");
  // El Enter del escaneo no abre nada; uno tipeado después, sí.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  const line = page.getByRole("dialog", { name: /Coca-Cola/ });
  await expect(line).toBeVisible();
  // Dentro del tope de descuento sin PIN.
  await line.getByLabel("Descuento a este producto ($)").fill("300");
  await line.getByLabel("Nota").fill("Lata abollada");
  await line.getByRole("button", { name: "Listo" }).click();
  await expect(line).toBeHidden();
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 4.300");
});
