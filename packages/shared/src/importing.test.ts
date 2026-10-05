import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { guessMapping, normalizeSheet } from "./importing";
import { readXlsx } from "./xlsx";
import { writeCsv, writeXlsx, xlsxFiles, zip } from "./xlsx-writer";

const CSV = `Producto;Código de barras;Costo;Precio;Categoría;Stock;Mínimo
"Galletitas de agua 200 g";7790895000782;1.000;1.500;Almacén;12;6
Yerba Playadito 1 kg;7791234000012;4850;7200;Infusiones;3;8
Sin precio;7790000000001;100;;Almacén;;
"Mate cocido ""Taragüí""";7790387000014;900,50;1350;Infusiones;20;
`;

describe("CSV", () => {
  it("detecta punto y coma y respeta comillas", () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(5);
    expect(rows[4]?.[0]).toBe('Mate cocido "Taragüí"');
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("relacionar columnas y validar", () => {
  it("adivina las columnas por el encabezado", () => {
    const [headers = []] = parseCsv(CSV);
    expect(guessMapping(headers)).toEqual({
      name: 0,
      barcode: 1,
      cost: 2,
      price: 3,
      category: 4,
      stock: 5,
      minStock: 6,
    });
  });

  it("normaliza montos argentinos y marca los errores", () => {
    const rows = parseCsv(CSV);
    const out = normalizeSheet(rows, guessMapping(rows[0] ?? []));
    expect(out[0]).toMatchObject({
      line: 2,
      name: "Galletitas de agua 200 g",
      priceCents: 150000,
      costCents: 100000,
      stock: 12,
      minStock: 6,
      errors: [],
    });
    expect(out[2]?.errors).toEqual(["Falta el precio"]);
    expect(out[3]).toMatchObject({ costCents: 90050, priceCents: 135000 });
  });
});

describe("Excel", () => {
  const rows = [
    ["Producto", "EAN", "Precio", "Stock"],
    ["Galletitas de agua 200 g", "7790895000782", 1500, 12],
    ["Queso cremoso", "", 13500.5, 1.8],
  ];

  it("lee lo que escribe (sin compresión)", async () => {
    const back = await readXlsx(writeXlsx(rows));
    expect(back).toEqual([
      ["Producto", "EAN", "Precio", "Stock"],
      ["Galletitas de agua 200 g", "7790895000782", "1500", "12"],
      ["Queso cremoso", "", "13500.5", "1.8"],
    ]);
  });

  it("lee un archivo comprimido como los que guarda Excel", async () => {
    const files = await Promise.all(
      xlsxFiles(rows).map(async (f) => {
        const stream = new Blob([f.data as BlobPart])
          .stream()
          .pipeThrough(new CompressionStream("deflate-raw"));
        const raw = new Uint8Array(await new Response(stream).arrayBuffer());
        return { ...f, method: 8 as const, raw };
      }),
    );
    const back = await readXlsx(zip(files));
    expect(back[1]?.[0]).toBe("Galletitas de agua 200 g");
    const mapped = normalizeSheet(back, guessMapping(back[0] ?? []));
    expect(mapped[1]).toMatchObject({ name: "Queso cremoso", priceCents: 1350050, stock: 1.8 });
  });

  it("exporta CSV con punto y coma", () => {
    expect(writeCsv([["a;b", 'c"d', 3]])).toBe('﻿"a;b";"c""d";3');
  });

  it("rechaza lo que no es un Excel", async () => {
    await expect(readXlsx(new Uint8Array([1, 2, 3]))).rejects.toThrow("No es un archivo de Excel");
  });
});
