import { expect, test } from "@playwright/test";
import { loginOwner, loginWithPin, scanWithGun } from "./helpers";

test("recepción del pedido 0042 en el iPhone: falta yogur y el dueño completa los costos", async ({
  browser,
}) => {
  // El dueño marca el pedido como enviado.
  const owner = await browser.newPage();
  await loginOwner(owner);
  await owner.goto("/compras/pedidos");
  await owner.getByRole("button", { name: /0042/ }).click();
  // (Si otro test ya lo marcó enviado, el botón no está: se sigue igual.)
  const send = owner.getByRole("button", { name: "Marcar enviado" });
  if (
    await send.waitFor({ state: "visible", timeout: 5000 }).then(
      () => true,
      () => false,
    )
  )
    await send.click();
  await expect(
    owner
      .getByRole("complementary", { name: "Detalle del pedido" })
      .getByText("Enviado", { exact: true }),
  ).toBeVisible();

  // Nico recibe en el iPhone.
  const nico = await browser.newPage({ viewport: { width: 393, height: 852 } });
  await loginWithPin(nico, "Nico", "5678");
  await nico.goto("/compras/recepcion");
  await nico.getByRole("button", { name: /Pedido 0042 · Lácteos del Sur/ }).click();
  await expect(nico.getByRole("heading", { name: "Recibir pedido 0042" })).toBeVisible();
  await expect(nico.getByRole("status", { name: "Avance" })).toHaveText("0 de 14");

  // Recién cargada la pantalla, el render puede separar las teclas: se reintenta el escaneo.
  const scan = async (code: string, name: string) => {
    const card = nico.getByRole("region", { name: `Recibiendo ${name}` });
    await expect(async () => {
      if (!(await card.isVisible())) await scanWithGun(nico, code);
      await expect(card).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 10_000 });
    return card;
  };
  const yogur = await scan("7790000002038", "Yogur bebible 1 L");
  // El repositor no ve costos.
  await expect(yogur.getByLabel("Costo por unidad")).toHaveCount(0);
  await yogur.getByLabel("Recibido Yogur bebible 1 L").fill("10");
  await expect(yogur.getByText("Faltan 2")).toBeVisible();
  await yogur.getByLabel("Recibido Yogur bebible 1 L").press("Enter");
  await expect(nico.getByRole("status", { name: "Avance" })).toHaveText("1 de 14");
  // Un corte de red (y la sincronización al volver) no borra lo cargado (ronda 3).
  await nico.context().setOffline(true);
  await nico.waitForTimeout(3000);
  await nico.context().setOffline(false);
  await nico.waitForTimeout(4000);
  await expect(nico.getByRole("status", { name: "Avance" })).toHaveText("1 de 14");

  const leche = await scan("7790000002014", "Leche entera 1 L sachet");
  await leche.getByLabel("Recibido Leche entera 1 L sachet").fill("24");
  await leche.getByRole("button", { name: "Lote y vencimiento" }).click();
  await leche.getByLabel("Lote").fill("L-881");
  // Una fecha que no vence nunca en la prueba (las de más de 30 días atrás se rechazan).
  const vence = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  await leche.getByLabel("Vence").fill(vence);
  await leche.getByRole("button", { name: "Listo" }).click();

  await nico.getByRole("button", { name: "Todo lo demás como pedido" }).click();
  await expect(nico.getByRole("status", { name: "Avance" })).toHaveText("14 de 14");
  await nico.getByRole("button", { name: "Confirmar recepción" }).click();
  const diff = nico.getByRole("dialog", { name: "Recepción con diferencias" });
  await expect(diff.getByRole("list", { name: "Diferencias" })).toHaveText(
    "Faltan 2 unidades de Yogur bebible 1 L",
  );
  await diff.getByRole("button", { name: "Confirmar igual" }).click();
  await expect(nico.getByText("Recepción confirmada: entró el stock")).toBeVisible();

  // El pedido queda recibido parcial, con lo recibido al lado de lo pedido.
  await expect(async () => {
    await owner.reload();
    await expect(
      owner
        .getByRole("complementary", { name: "Detalle del pedido" })
        .getByText("Recibido parcial", { exact: true }),
    ).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  const lecheRow = owner.getByRole("row", { name: /Leche entera 1 L sachet/ });
  await expect(lecheRow).toContainText("24");

  // El dueño completa los costos: el yogur subió.
  await owner.goto("/compras/recepcion");
  await owner
    .getByRole("region", { name: "Para completar costos" })
    .getByRole("button", { name: /Pedido 0042/ })
    .click();
  await owner.getByLabel("Costo Yogur bebible 1 L").fill("2350");
  await expect(
    owner.getByRole("status").filter({ hasText: "El costo subió 12 %: $ 2.100 → $ 2.350" }),
  ).toBeVisible();
  await owner.getByRole("button", { name: "Guardar costos" }).click();
  await expect(owner.getByText("Costos guardados: quedó la cuenta a pagar")).toBeVisible();
});
