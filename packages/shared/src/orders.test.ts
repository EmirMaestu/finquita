import { describe, expect, it } from "vitest";
import { canMoveOrder, deliveryLabel, orderMessage, orderQty, waLink, waPhone } from "./orders";

const lines = [
  { description: "Leche entera 1 L sachet", qty: 24, packQty: 12, packName: "Cajón" },
  { description: "Yogur bebible 1 L", qty: 12, packQty: 6, packName: "Caja" },
  { description: "Ricota 500 g", qty: 4 },
  { description: "Queso cremoso", qty: 2.5, unit: "kg" as const },
];

describe("mensaje del pedido", () => {
  it("escribe el pedido 0042 para Marcelo, con bultos y total", () => {
    const text = orderMessage({
      businessName: "Almacén La Esquina",
      contactName: "Marcelo",
      number: 42,
      expectedOn: "2026-10-08",
      lines,
      totalCents: 18_640_000,
    });
    expect(text).toBe(
      [
        "Hola Marcelo, te paso el pedido 0042 de Almacén La Esquina para el jueves 8/10:",
        "",
        "• Leche entera 1 L sachet: 24 u (2 cajones)",
        "• Yogur bebible 1 L: 12 u (2 cajas)",
        "• Ricota 500 g: 4 u",
        "• Queso cremoso: 2,500 kg",
        "",
        "4 productos, total estimado $ 186.400.",
        "¿Me confirmás qué tenés? Gracias.",
      ].join("\n"),
    );
  });

  it("sin contacto, sin fecha y sin total; con el código del proveedor y una nota", () => {
    const text = orderMessage({
      businessName: "Almacén La Esquina",
      number: 7,
      lines: [{ description: "Lavandina 1 L", qty: 12, supplierCode: "LC-1" }],
      notes: "Si no hay, mandá la de 2 L.",
    });
    expect(text.split("\n")[0]).toBe("Hola, te paso el pedido 0007 de Almacén La Esquina:");
    expect(text).toContain("• Lavandina 1 L [LC-1]: 12 u");
    expect(text).toContain("1 producto.\nSi no hay, mandá la de 2 L.");
  });

  it("bultos: solo si la cantidad es justa; 1 bulto en singular", () => {
    expect(orderQty({ description: "x", qty: 12, packQty: 12, packName: "Cajón" })).toBe(
      "12 u (1 cajón)",
    );
    expect(orderQty({ description: "x", qty: 13, packQty: 12 })).toBe("13 u");
    expect(deliveryLabel("2026-10-05")).toBe("lunes 5/10");
  });
});

describe("enlace wa.me", () => {
  it("arma el enlace con el número y el texto codificado", () => {
    expect(waLink("5492614000002", "Hola Marcelo, pedido 0042:\n• Leche: 24 u")).toBe(
      "https://wa.me/5492614000002?text=Hola%20Marcelo%2C%20pedido%200042%3A%0A%E2%80%A2%20Leche%3A%2024%20u",
    );
    // Sin número: abre WhatsApp para elegir el contacto.
    expect(waLink(null, "Hola")).toBe("https://wa.me/?text=Hola");
  });

  it("normaliza números argentinos", () => {
    expect(waPhone("+54 9 261 400-0002")).toBe("5492614000002");
    expect(waPhone("0261 4000002")).toBe("5492614000002");
    expect(waPhone("54 261 4000002")).toBe("5492614000002");
    expect(waPhone("123")).toBeNull();
  });
});

describe("estados", () => {
  it("se marcan a mano en orden; recibido lo pone la recepción", () => {
    expect(canMoveOrder("draft", "sent")).toBe(true);
    expect(canMoveOrder("sent", "confirmed")).toBe(true);
    expect(canMoveOrder("sent", "received")).toBe(false);
    expect(canMoveOrder("cancelled", "sent")).toBe(false);
  });
});
