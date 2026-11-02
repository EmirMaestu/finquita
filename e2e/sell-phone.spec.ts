import { devices, expect, test } from "@playwright/test";
import { ensureShiftOpen, loginOwner } from "./helpers";

// El dueño vende desde el iPhone (375 px, el más angosto que se usa).
test.use({
  ...devices["iPhone 13"],
  defaultBrowserType: "chromium",
  viewport: { width: 375, height: 812 },
});

test("cobro en el iPhone: Confirmar cobro se ve sin bajar y los textos no hablan de teclas", async ({
  page,
}) => {
  await loginOwner(page);
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Huevos maple/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /Huevos maple/ }).click();
  await expect(page.getByRole("button", { name: /Cobrar/ })).toContainText("$ 8.200");
  await page.getByRole("button", { name: /Cobrar/ }).click();
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await expect(pay).toBeVisible();
  const confirm = pay.getByRole("button", { name: /Confirmar cobro/ });
  await expect(confirm).toBeInViewport();
  await expect(confirm).not.toContainText("Ctrl", { useInnerText: true });
  // Sin tipear nada, el efectivo justo cubre la venta: no dice que falta todo.
  await expect(pay.getByText("Falta")).toHaveCount(0);
  await confirm.click();
  const done = page.getByRole("button", { name: "Venta lista" });
  await expect(done).toContainText("Tocá para la próxima venta", { useInnerText: true });
  await expect(done).not.toContainText("Cualquier tecla", { useInnerText: true });
});

test("en el iPhone, tocar la cantidad abre el teclado y la deja en 3", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/vender");
  await ensureShiftOpen(page);
  await expect(page.getByRole("button", { name: /Huevos maple/ })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /Huevos maple/ }).click();
  await page.getByRole("button", { name: /Cantidad de Huevos maple/ }).click();
  const dialog = page.getByRole("dialog", { name: /Huevos maple/ });
  await dialog.getByRole("button", { name: "3", exact: true }).click();
  await dialog.getByRole("button", { name: "Listo" }).click();
  await expect(
    page.getByRole("button", { name: /Cantidad de Huevos maple x 30: 3/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Cobrar/ })).toContainText("$ 24.600");
});
