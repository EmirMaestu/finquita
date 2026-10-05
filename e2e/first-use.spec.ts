import { expect, test } from "@playwright/test";
import { E2E } from "./env";
import { ensureShiftOpen, scanWithGun } from "./helpers";

const at = (path: string) => `${E2E.empty.webUrl}${path}`;

test("primer uso: de la base vacía a la primera venta", async ({ page }) => {
  // 1. Crear la cuenta y cargar los datos del negocio.
  await page.goto(at("/"));
  await page.getByRole("button", { name: "¿Primera vez? Creá la cuenta del dueño" }).click();
  await page.getByLabel("Tu nombre").fill("Ana Pérez");
  await page.getByLabel("Email").fill("ana@donpepe.example");
  await page.getByLabel("Contraseña").fill("una-contraseña-larga");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "¡Hola, Ana!" })).toBeVisible();
  await page.getByLabel("Nombre del negocio").fill("Almacén Don Pepe");
  await page.getByLabel("Localidad").fill("Maipú");
  await page.getByRole("button", { name: "Empezar" }).click();

  // La checklist reemplaza al panel mientras no hay ventas.
  const steps = page.getByRole("region", { name: "Primeros pasos" });
  await expect(steps).toContainText("1 de 7");

  // 3. Medios de pago y alias.
  await steps.getByRole("button", { name: "Medios de pago" }).click();
  const transfer = page.getByRole("region", { name: "Transferencia y QR" });
  await transfer.getByLabel("Alias").fill("don.pepe.mp");
  await transfer.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado")).toBeVisible();
  await page.getByRole("link", { name: "Inicio" }).click();
  await expect(steps).toContainText("2 de 7");

  // 2. Habilitar la Mac del mostrador (desde ahí el equipo entra con PIN).
  await page.goto(at("/ajustes/dispositivos"));
  const device = page.getByRole("region", { name: "Este dispositivo" });
  await device.getByRole("button", { name: "Habilitar este dispositivo" }).click();
  await expect(device).toContainText("Está habilitado");
  await page.getByRole("link", { name: "Inicio" }).click();

  // 6. Abrir la primera caja.
  await steps.getByRole("button", { name: "Abrir caja" }).click();
  await ensureShiftOpen(page);
  await expect(page.getByRole("region", { name: "Efectivo esperado" })).toBeVisible();

  // Vender: lo que no está cargado se da de alta al escanearlo.
  await page.getByRole("link", { name: "Vender" }).click();
  const search = page.getByLabel("Escaneá o buscá por nombre");
  await expect(search).toBeVisible();
  const unknown = page.getByRole("dialog", { name: "El código 7790000099990 no está cargado" });
  await expect(async () => {
    if (!(await unknown.isVisible())) await scanWithGun(page, "7790000099990");
    await expect(unknown).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 10_000 });
  await unknown.getByLabel("Nombre").fill("Alfajor triple");
  await unknown.getByLabel("Precio").fill("1500");
  await unknown.getByRole("button", { name: "Crear y sumar a la venta" }).click();
  await expect(page.getByRole("status", { name: "Total" })).toHaveText("$ 1.500");
  await page.keyboard.press("F12");
  const pay = page.getByRole("dialog", { name: "Cobrar" });
  await pay.getByRole("button", { name: "Justo" }).click();
  await pay.getByRole("button", { name: /Confirmar cobro/ }).click();
  await expect(page.getByRole("button", { name: "Venta lista" })).toContainText("$ 1.500");

  // Con la primera venta, Inicio muestra el panel del día.
  await page.goto(at("/inicio"));
  await expect(page.getByRole("region", { name: "Ventas", exact: true })).toContainText("$ 1.500", {
    timeout: 20_000,
  });
  await expect(steps).toHaveCount(0);
});
