import { barRects, ean13Modules } from "@mostrador/shared";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";

/** Medidas A4 en puntos. */
export const A4 = { w: 595.28, h: 841.89 };
export const mm = (v: number) => (v * 72) / 25.4;

/** Las fuentes estándar del PDF usan WinAnsi: se reemplaza lo que no entra. */
export function pdfText(s: string): string {
  return s
    .replace(/−/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E -ÿ›×·•–—]/g, "");
}

export async function newPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, bold };
}

/** Recorta un texto al ancho disponible. */
export function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  let t = pdfText(text);
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1);
  return `${t}...`;
}

/** Dibuja un EAN-13 con sus dígitos abajo. */
export function drawEan13(
  page: PDFPage,
  font: PDFFont,
  code: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const modules = ean13Modules(code);
  const unit = width / modules.length;
  for (const r of barRects(modules)) {
    page.drawRectangle({
      x: x + r.x * unit,
      y: y + 9,
      width: r.w * unit,
      height: height - 9,
      color: rgb(0, 0, 0),
    });
  }
  const size = 8;
  const tw = font.widthOfTextAtSize(code, size);
  page.drawText(code, { x: x + (width - tw) / 2, y, size, font });
}
