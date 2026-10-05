// @vitest-environment node
import { arDateTime } from "@mostrador/shared";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { ticketFromSale, ticketPdf } from "../src/sell/ticket";

describe("ticket en PDF", () => {
  it("arma un PDF de 58 mm con la venta", async () => {
    const t = ticketFromSale(
      {
        number: 4187,
        deviceAt: arDateTime("2026-10-03", "18:41").toISOString(),
        memberName: "Tomás",
        lines: [
          {
            description: "Coca-Cola 2,25 L",
            qty: 1,
            unit: "unit",
            unitPriceCents: 460000,
            totalCents: 460000,
          },
        ],
        payments: [{ method: "cash", amountCents: 500000 }],
        totalCents: 460000,
        discountCents: 0,
        surchargeCents: 0,
        changeCents: 40000,
      },
      { name: "Almacén La Esquina", address: "San Martín 1234", city: "Godoy Cruz, Mendoza" },
    );
    const bytes = await ticketPdf(t, 58);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(164);
  });
});
