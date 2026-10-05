/** EAN-13: dígito verificador, códigos internos (empiezan con 2) y el dibujo de las barras. */

export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error("Hacen falta 12 dígitos");
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/** Código interno para lo que no tiene código de barras: "2" + PLU en 11 dígitos + verificador. */
export function internalBarcode(plu: string | number): string {
  const digits = String(plu).replace(/\D/g, "");
  if (!digits || digits.length > 11) throw new Error("El PLU tiene que tener de 1 a 11 dígitos");
  const first12 = `2${digits.padStart(11, "0")}`;
  return first12 + ean13CheckDigit(first12);
}

const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const G = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111",
];
const R = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100",
];
const PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

/** Las 95 franjas del EAN-13 ("1" barra, "0" espacio). */
export function ean13Modules(code: string): string {
  if (!isValidEan13(code)) throw new Error(`El código ${code} no es un EAN-13 válido`);
  const d = code.split("").map(Number);
  const parity = PARITY[d[0] ?? 0] ?? "LLLLLL";
  let out = "101";
  for (let i = 1; i <= 6; i++) out += (parity[i - 1] === "L" ? L : G)[d[i] ?? 0];
  out += "01010";
  for (let i = 7; i <= 12; i++) out += R[d[i] ?? 0];
  return `${out}101`;
}

/** Rectángulos de las barras (en franjas), para dibujar en SVG o PDF. */
export function barRects(modules: string): { x: number; w: number }[] {
  const rects: { x: number; w: number }[] = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === "1") {
      let w = 1;
      while (modules[i + w] === "1") w++;
      rects.push({ x: i, w });
      i += w;
    } else i++;
  }
  return rects;
}
