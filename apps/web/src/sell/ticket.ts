import { type TicketData, type TicketWidth, ticketLines } from "@mostrador/shared";

/** Imprime el ticket con la impresión del navegador, en papel de 58 u 80 mm. */
export function printTicket(t: TicketData, width: TicketWidth, copies = 1): Promise<void> {
  return new Promise((resolve) => {
    const lines = ticketLines(t, width).join("\n");
    const box = document.createElement("div");
    box.id = "print-ticket";
    box.setAttribute("aria-hidden", "true");
    const pre = document.createElement("pre");
    pre.textContent = Array(Math.max(1, copies)).fill(lines).join("\n\n\n");
    box.appendChild(pre);
    const style = document.createElement("style");
    style.textContent = `@media print {
      @page { size: ${width}mm auto; margin: 2mm; }
      body > *:not(#print-ticket) { display: none !important; }
      #print-ticket { display: block !important; }
      #print-ticket pre { font: 9px/1.25 ui-monospace, Menlo, monospace; margin: 0; white-space: pre; color: #000; }
    }
    #print-ticket { display: none; }`;
    document.body.append(style, box);
    const done = () => {
      box.remove();
      style.remove();
      window.removeEventListener("afterprint", done);
      resolve();
    };
    window.addEventListener("afterprint", done);
    try {
      window.print();
    } catch {
      done();
    }
    // Si el navegador no avisa "afterprint", se limpia igual.
    setTimeout(done, 60_000);
  });
}

/** El ticket como PDF, armado en el dispositivo (sirve sin conexión). */
export async function ticketPdf(t: TicketData, width: TicketWidth): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const lines = ticketLines(t, width).map((l) =>
    l.replace(/[^\x20-\x7E -ÿ]/g, (ch) => ({ "¡": "¡", "−": "-" })[ch] ?? ""),
  );
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Courier);
  const size = width === 58 ? 7.4 : 8;
  const pageW = (width * 72) / 25.4;
  const lineH = size * 1.3;
  const margin = 6;
  const page = doc.addPage([pageW, margin * 2 + lines.length * lineH]);
  lines.forEach((l, i) => {
    page.drawText(l, { x: margin, y: page.getHeight() - margin - (i + 1) * lineH + 2, size, font });
  });
  return doc.save();
}

/** Compartir el ticket (hoja de compartir del dispositivo); si no se puede, se abre el PDF. */
export async function shareTicket(
  t: TicketData,
  width: TicketWidth,
): Promise<"shared" | "opened" | "cancelled"> {
  const bytes = await ticketPdf(t, width);
  const name = `venta-${String(t.number).padStart(6, "0")}.pdf`;
  const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `Venta ${String(t.number).padStart(6, "0")}` });
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "opened";
}

/** Datos del ticket a partir de una venta guardada en el dispositivo. */
export function ticketFromSale(
  s: {
    number: number;
    deviceAt: string;
    memberName: string;
    lines: {
      description: string;
      qty: number;
      unit: "unit" | "kg";
      unitPriceCents: number;
      totalCents: number;
      discountCents?: number;
      kind?: string;
    }[];
    payments: { method: TicketData["payments"][number]["method"]; amountCents: number }[];
    totalCents: number;
    discountCents: number;
    surchargeCents: number;
    changeCents: number;
    status?: string;
  },
  business: TicketData["business"],
  footer?: string | null,
  customer?: string | null,
): TicketData {
  return {
    business,
    number: s.number,
    at: new Date(s.deviceAt),
    cashier: s.memberName,
    customer: customer ?? null,
    lines: s.lines,
    discountCents: s.discountCents,
    surchargeCents: s.surchargeCents,
    totalCents: s.totalCents,
    payments: s.payments,
    changeCents: s.changeCents,
    footer: footer ?? null,
    voided: s.status === "voided",
  };
}
