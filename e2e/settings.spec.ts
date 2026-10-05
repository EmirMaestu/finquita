import { expect, test } from "@playwright/test";
import { ensureShiftOpen, loginOwner, loginWithPin, scanWithGun } from "./helpers";

test("Ajustes: el dueño cambia el recargo de crédito y el cobro lo usa", async ({ browser }) => {
  const owner = await browser.newPage();
  await loginOwner(owner);
  await owner.goto("/ajustes/medios");
  const credit = owner.getByRole("region", { name: "Crédito" });
  await credit.getByLabel("Recargo Crédito (%)").fill("15");
  await credit.getByLabel("Recargo Crédito (%)").press("Tab");
  await expect(owner.getByText("Guardado")).toBeVisible();

  // En la Mac del mostrador, el cobro ya muestra el recargo nuevo.
  const mac = await browser.newPage();
  await loginWithPin(mac, "Tomás", "4567");
  await mac.goto("/vender");
  await ensureShiftOpen(mac);
  await expect(mac.getByRole("button", { name: /Pan francés/ })).toBeVisible({ timeout: 20_000 });
  await scanWithGun(mac, "7791234000012");
  await expect(mac.getByRole("status", { name: "Total" })).toHaveText("$ 6.900");
  await mac.keyboard.press("F12");
  const pay = mac.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("button", { name: "Tarjeta" }).click();
  await pay.getByRole("button", { name: "Crédito +15 %" }).click();
  // 15 % de $ 6.900.
  await expect(pay).toContainText("$ 1.035");
  await mac.keyboard.press("Escape");

  // Se vuelve al 10 % para no cambiar los otros recorridos.
  await credit.getByLabel("Recargo Crédito (%)").fill("10");
  await credit.getByLabel("Recargo Crédito (%)").press("Tab");
  await expect(owner.getByText("Guardado").first()).toBeVisible();
});
