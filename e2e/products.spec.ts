import { expect, test } from "@playwright/test";
import { loginOwner } from "./helpers";

test("el dueño crea un producto y le cambia el precio", async ({ page }) => {
  await loginOwner(page);
  await page.getByRole("link", { name: "Productos" }).click();
  await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Productos" })).toContainText(
    "Yerba Playadito 1 kg",
  );

  await page.getByRole("button", { name: "Nuevo producto" }).click();
  const form = page.getByRole("dialog", { name: "Nuevo producto" });
  await form.getByLabel("Nombre y presentación").fill("Galletitas de agua 200 g");
  await form.getByLabel("Categoría").selectOption({ label: "Almacén" });
  await form.getByLabel("Costo").fill("1000");
  await form.getByLabel("Precio de venta").fill("1500");
  await expect(form.getByText("Ganancia 50 % sobre el costo")).toBeVisible();
  await form.getByLabel("Códigos de barras").fill("7790895000782");
  await form.getByLabel("Stock mínimo").fill("6");
  await form.getByLabel("Stock inicial").fill("12");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(form).toBeHidden();

  // Queda abierta su ficha en el panel de la derecha.
  const panel = page.getByRole("complementary", { name: "Ficha del producto" });
  await expect(panel.getByRole("heading", { name: "Galletitas de agua 200 g" })).toBeVisible();
  await expect(panel).toContainText("OK · 12");

  // Buscarlo por código y editar el precio.
  await page.getByLabel("Buscar productos").fill("7790895000782");
  const row = page.getByRole("row", { name: /Galletitas de agua 200 g/ });
  await expect(row).toContainText("$ 1.500");
  await panel.getByRole("button", { name: "Editar" }).click();
  const edit = page.getByRole("dialog", { name: "Editar producto" });
  await edit.getByLabel("Precio de venta").fill("1650");
  await edit.getByRole("button", { name: "Guardar" }).click();
  await expect(edit).toBeHidden();
  await expect(row).toContainText("$ 1.650");

  await panel.getByRole("tab", { name: "Historial" }).click();
  await expect(panel).toContainText("Cambio de precio");
  await expect(panel).toContainText("$ 1.500 → $ 1.650");
});
