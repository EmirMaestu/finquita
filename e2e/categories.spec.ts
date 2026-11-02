import { expect, test } from "@playwright/test";
import { loginOwner } from "./helpers";

test("Productos › Más acciones › Categorías: crear un rubro con ganancia por defecto", async ({
  page,
}) => {
  await loginOwner(page);
  await page.goto("/productos");
  await page.getByRole("button", { name: "Más acciones" }).click();
  await page.getByRole("menuitem", { name: "Categorías" }).click();
  await expect(page.getByRole("heading", { name: "Categorías" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Categorías" })).toContainText("Lácteos");
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  const form = page.getByRole("dialog", { name: "Nueva categoría" });
  await form.getByLabel("Nombre").fill("Pañales y bebé");
  await form.getByLabel("Ganancia por defecto (%)").fill("35");
  await form.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Categoría creada: Pañales y bebé")).toBeVisible();
  await expect(page.getByRole("list", { name: "Categorías" })).toContainText("Pañales y bebé");
  await expect(page.getByRole("list", { name: "Categorías" })).toContainText("35 % de ganancia");
});
