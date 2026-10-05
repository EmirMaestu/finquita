import { isValidEan13 } from "@mostrador/shared";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { products } from "../src/db/schema/index";
import { as } from "./helpers/actors";
import { TEST_AUTH } from "./helpers/client";
import { useSeededDb } from "./helpers/seeded";

const ref = useSeededDb();
const app = () => createApp({ db: ref.t.db, auth: TEST_AUTH });

describe("planilla de códigos", () => {
  it("lista los productos sin código de barras con su código interno que empieza con 2", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const r = await carlos.get("/api/labels/codes");
    expect(r.status).toBe(200);
    const names = r.body.map((i: { name: string }) => i.name);
    expect(names.sort()).toEqual([
      "Huevo suelto",
      "Huevos maple x 30",
      "Jamón cocido",
      "Pan francés",
      "Queso cremoso",
    ]);
    const pan = r.body.find((i: { name: string }) => i.name === "Pan francés");
    expect(pan).toMatchObject({ plu: "1001", code: "2000000010014", saleUnit: "kg" });
    for (const i of r.body) {
      expect(i.code.startsWith("2")).toBe(true);
      expect(isValidEan13(i.code)).toBe(true);
    }
  });

  it("a lo que no tiene código ni PLU le asigna el próximo libre", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const nuevo = await carlos.post("/api/products", {
      name: "Verdura por plata",
      priceCents: 100,
    });
    const r = await carlos.get("/api/labels/codes");
    const verdura = r.body.find((i: { id: string }) => i.id === nuevo.body.id);
    expect(verdura.plu).toBe("4001");
    const [p] = await ref.t.db.select().from(products).where(eq(products.id, nuevo.body.id));
    expect(p?.internalCode).toBe("4001");
    // La segunda vez no cambia.
    expect(
      (await carlos.get("/api/labels/codes")).body.find(
        (i: { id: string }) => i.id === nuevo.body.id,
      ).plu,
    ).toBe("4001");
  });

  it("genera la planilla en PDF A4", async () => {
    const carlos = await as(app(), ref.t.db, "carlos");
    const res = await app().request("http://localhost/api/labels/codes.pdf", {
      headers: {
        "x-device-token": carlos.deviceToken ?? "",
        authorization: `Bearer ${carlos.pinToken}`,
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const doc = await PDFDocument.load(new Uint8Array(await res.arrayBuffer()));
    expect(doc.getPageCount()).toBe(1);
    const [w, h] = [doc.getPage(0).getWidth(), doc.getPage(0).getHeight()];
    expect(Math.round(w)).toBe(595);
    expect(Math.round(h)).toBe(842);
  });
});
