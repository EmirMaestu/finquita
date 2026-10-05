import { expect, test } from "@playwright/test";
import { loginWithPin, scanWithGun } from "./helpers";

test("conteo chico: Nico cuenta a ciegas y el encargado aprueba", async ({ browser }) => {
  // El encargado crea el conteo y se lo asigna a Nico.
  const julian = await browser.newPage();
  await loginWithPin(julian, "Julián", "2345");
  await julian.goto("/productos/conteos");
  await julian.getByRole("button", { name: "Nuevo conteo" }).click();
  const form = julian.getByRole("dialog", { name: "Nuevo conteo" });
  await form.getByLabel("Nombre").fill("Góndola 2, Aceites");
  await form.getByLabel("Categoría").selectOption({ label: "Almacén › Aceites" });
  await form.getByLabel("Asignar a").selectOption({ label: "Nico" });
  await form.getByRole("button", { name: "Crear conteo" }).click();
  await expect(julian.getByRole("heading", { name: "Góndola 2, Aceites" })).toBeVisible();
  const url = julian.url();

  // Nico cuenta: escanea la yerba y tipea 2. No ve el stock del sistema.
  const nico = await browser.newPage();
  await loginWithPin(nico, "Nico", "5678");
  await nico.goto(url);
  await expect(nico.getByRole("status", { name: "Avance" })).toHaveText("0 de 1");
  await expect(nico.getByText(/Sistema/)).toHaveCount(0);
  await scanWithGun(nico, "7790000003011");
  const entry = nico.getByRole("dialog", { name: "Aceite de girasol 1,5 L" });
  await expect(entry).toBeVisible();
  for (const d of "8") await entry.getByRole("button", { name: d, exact: true }).click();
  await entry.getByRole("button", { name: /Guardar/ }).click();
  await expect(nico.getByRole("status", { name: "Avance" })).toHaveText("1 de 1");
  await nico.getByRole("button", { name: "Terminar conteo" }).click();
  await expect(nico.getByText("Listo: lo revisa un encargado o el dueño.")).toBeVisible();

  // El encargado revisa la diferencia y aprueba.
  await julian.reload();
  const list = julian.getByRole("list", { name: "Productos del conteo" });
  await expect(list).toContainText("Sistema 9");
  await expect(list).toContainText("−1");
  await julian.getByRole("button", { name: "Aprobar todo" }).click();
  await expect(julian.getByText("Aprobado: 1 productos, 1 con diferencia")).toBeVisible();
  await expect(julian.getByText("Aprobado", { exact: true })).toBeVisible();
});
